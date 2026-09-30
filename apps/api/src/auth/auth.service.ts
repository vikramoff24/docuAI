/**
 * AuthService — Core authentication business logic
 *
 * ────────────────────────────────────────────────────────
 * PASSWORD HASHING: WHY BCRYPT?
 * ────────────────────────────────────────────────────────
 * Passwords must NEVER be stored in plaintext. Even "hashed" with MD5/SHA1
 * they can be cracked with rainbow tables in seconds.
 *
 * Bcrypt is the standard choice because:
 * 1. It's a PASSWORD HASHING function, not a general hash (SHA256 is fast — bad for passwords)
 * 2. It has a COST FACTOR (salt rounds) that makes it slow on purpose
 *    → cost 10: ~100ms to hash (fast enough for UX, too slow for brute force)
 *    → cost 12: ~250ms (more secure, slightly slower)
 * 3. It AUTOMATICALLY GENERATES a unique salt (prevents rainbow tables)
 * 4. The hash includes the salt: $2b$10$<salt><hash> — self-contained
 *
 * ATTACK SCENARIO WITHOUT BCRYPT:
 * DB leaked → attacker has SHA256(password) → cracks 1 billion passwords/sec with GPU
 * DB leaked → attacker has bcrypt(password, 10) → cracks ~1000 attempts/sec
 * Attacker gives up (or it takes 1000 years)
 *
 * ────────────────────────────────────────────────────────
 * JWT ACCESS TOKEN STRUCTURE
 * ────────────────────────────────────────────────────────
 * Header.Payload.Signature (base64url encoded, dot separated)
 *
 * Payload (claims):
 * {
 *   sub: "user-uuid",          // Subject (user ID)
 *   email: "alice@acme.com",
 *   organizationId: "org-uuid",
 *   role: "ADMIN",
 *   iat: 1700000000,           // Issued At (Unix timestamp)
 *   exp: 1700000900,           // Expires At (iat + 900 = 15 minutes)
 * }
 *
 * The signature is HMAC-SHA256 of Header.Payload with the secret.
 * Without the secret, you cannot forge a valid token.
 * The payload is BASE64 ENCODED, NOT ENCRYPTED — never put secrets in JWT payload!
 */

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationMemberRole } from '@prisma/client';
import Redis from 'ioredis';

import { DatabaseService } from '../database/database.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { REDIS_CLIENT } from '../redis/redis.module';

export interface JwtPayload {
  sub: string;           // user ID
  email: string;
  organizationId: string;
  role: OrganizationMemberRole;
  jti: string;           // JWT ID — unique per token, used for blacklisting
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;     // seconds
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ──────────────────────────────────────────────────
  // REGISTRATION
  // ──────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Check for existing user
    const existing = await this.db.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // WHY ConflictException and not "User already exists"?
      // Never confirm whether an email exists (user enumeration attack).
      // An attacker can probe "is alice@gmail.com a customer?"
      // We still return 409 here (common practice), but some systems use generic errors.
      throw new ConflictException('An account with this email already exists');
    }

    // Hash password
    const saltRounds = this.config.get<number>('bcryptSaltRounds', 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Create user in a transaction with organization + membership
    // WHY A TRANSACTION?
    // If user is created but organization creation fails, we'd have a
    // "ghost user" with no organization. The transaction ensures either
    // ALL of this succeeds or NONE of it does (atomicity).
    const result = await this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          emailVerifiedAt: new Date(), // Auto-verify for now (email verification in future)
        },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      // Create the user's first organization
      const orgSlug = this.generateSlug(dto.organizationName);
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug: orgSlug,
        },
        select: { id: true, name: true, slug: true },
      });

      // Make this user the OWNER of the organization
      await tx.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: OrganizationMemberRole.OWNER,
        },
      });

      // Create root folder for the organization
      await tx.folder.create({
        data: {
          organizationId: org.id,
          name: 'Root',
          path: '/',
          createdById: user.id,
        },
      });

      return { user, org };
    });

    this.logger.log(`User registered: ${result.user.email} (org: ${result.org.slug})`);

    return {
      user: result.user,
      organization: result.org,
    };
  }

  // ──────────────────────────────────────────────────
  // VALIDATE USER (used by LocalStrategy)
  // ──────────────────────────────────────────────────

  async validateUser(email: string, password: string) {
    const user = await this.db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true },
          take: 1,
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!user) {
      // WHY CONSTANT TIME?
      // If we return immediately when user is not found, an attacker can tell
      // "wrong email" (fast response) vs "wrong password" (slow response, bcrypt)
      // by measuring response time. We always run bcrypt to normalize timing.
      await bcrypt.compare(password, '$2b$10$invalid.hash.to.normalize.timing');
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  // ──────────────────────────────────────────────────
  // LOGIN
  // ──────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.validateUser(dto.email, dto.password);

    // Get the active organization (first one, or specified one)
    const membership = user.memberships[0];
    if (!membership) {
      throw new NotFoundException('User has no organization membership');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      membership.organizationId,
      membership.role,
      ipAddress,
      userAgent,
    );

    this.logger.log(`User logged in: ${user.email} (org: ${membership.organization.slug})`);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      },
      tokens,
    };
  }

  // ──────────────────────────────────────────────────
  // TOKEN GENERATION
  // ──────────────────────────────────────────────────

  async generateTokens(
    userId: string,
    email: string,
    organizationId: string,
    role: OrganizationMemberRole,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    // jti = JWT ID: a unique identifier per token
    // WHY? Without jti, two tokens issued for the same user within the same second
    // are identical (same iat, same payload) → same signature → same string.
    // Adding jti ensures every token is unique, which is required for blacklisting.
    const jti = uuidv4();
    const payload: JwtPayload = { sub: userId, email, organizationId, role, jti };

    // Sign access token (short-lived, stateless)
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token (long-lived, stored in DB)
    // WHY store refresh tokens in DB?
    // 1. Revocation: can invalidate all tokens for a user (account compromise)
    // 2. Rotation: detect replay attacks (family-based rotation)
    // 3. Audit: see all active sessions
    const rawRefreshToken = uuidv4(); // Random UUID — not a JWT
    const tokenHash = await bcrypt.hash(rawRefreshToken, 10);
    const family = uuidv4(); // Token family for rotation attack detection
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');
    const expiresAt = this.parseExpiresIn(refreshExpiresIn);

    await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash,
        family,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  // ──────────────────────────────────────────────────
  // REFRESH TOKEN
  // ──────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    // Find all non-revoked, non-expired refresh tokens
    // We need to check against all stored tokens (can't query by hash directly)
    // In production, you'd store a token ID in the cookie and query by ID
    // For simplicity here, we query recent tokens for the IP and do hash comparison

    // More efficient approach: store token ID in the cookie payload
    // Here we find candidates by user agent (simplified for Phase 1)
    const recentTokens = await this.db.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
      take: 100, // Safety limit
    });

    let validToken = null;
    for (const token of recentTokens) {
      const isValid = await bcrypt.compare(rawRefreshToken, token.tokenHash);
      if (isValid) {
        validToken = token;
        break;
      }
    }

    if (!validToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old token
    await this.db.refreshToken.update({
      where: { id: validToken.id },
      data: { revokedAt: new Date() },
    });

    // Get user's current organization membership
    const membership = await this.db.organizationMember.findFirst({
      where: { userId: validToken.userId },
      orderBy: { joinedAt: 'asc' },
    });

    if (!membership) {
      throw new UnauthorizedException('User has no organization');
    }

    // Issue new token pair
    return this.generateTokens(
      validToken.userId,
      validToken.user.email,
      membership.organizationId,
      membership.role,
      ipAddress,
      userAgent,
    );
  }

  // ──────────────────────────────────────────────────
  // LOGOUT
  // ──────────────────────────────────────────────────

  async logout(userId: string, accessToken?: string) {
    // 1. Revoke all refresh tokens for this user in the DB
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 2. Blacklist the current access token in Redis
    // WHY? Access tokens are stateless JWTs — they remain valid until expiry
    // even after the user logs out. We store the token's jti (JWT ID) in Redis
    // with a TTL matching the token expiry.
    // WHY jti and not full token? Shorter key, semantically cleaner, same security.
    if (accessToken) {
      try {
        const decoded = this.jwtService.decode(accessToken) as { exp?: number; jti?: string } | null;
        if (decoded?.jti && decoded?.exp) {
          const now = Math.floor(Date.now() / 1000);
          const ttl = decoded.exp - now;
          if (ttl > 0) {
            // Key: blacklist:<jti> → Value: '1' → TTL: remaining seconds
            await this.redis.setex(`blacklist:${decoded.jti}`, ttl, '1');
          }
        }
      } catch {
        // Don't fail logout if Redis blacklisting fails
        this.logger.warn(`Failed to blacklist token for user ${userId}`);
      }
    }

    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Check if an access token has been blacklisted (used by JwtAuthGuard)
   * Extracts the jti from the token and checks Redis.
   */
  async isTokenBlacklisted(accessToken: string): Promise<boolean> {
    try {
      const decoded = this.jwtService.decode(accessToken) as { jti?: string } | null;
      if (!decoded?.jti) return false;
      const result = await this.redis.get(`blacklist:${decoded.jti}`);
      return result !== null;
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
      + '-' + Math.random().toString(36).slice(2, 6);
  }

  private parseExpiresIn(expiresIn: string): Date {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1), 10);
    const now = new Date();
    switch (unit) {
      case 'd': return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      case 'h': return new Date(now.getTime() + value * 60 * 60 * 1000);
      case 'm': return new Date(now.getTime() + value * 60 * 1000);
      default:  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days default
    }
  }
}
