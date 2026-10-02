/**
 * JWT Strategy — Validates access tokens on protected routes
 *
 * ────────────────────────────────────────────────────────
 * HOW JWT VALIDATION WORKS
 * ────────────────────────────────────────────────────────
 * 1. Client sends: Authorization: Bearer <access_token>
 * 2. JwtAuthGuard activates JwtStrategy
 * 3. passport-jwt extracts the token from the Authorization header
 * 4. passport-jwt verifies the signature using our secret
 * 5. If signature is valid AND not expired → calls validate()
 * 6. validate() returns the user context → attached to req.user
 * 7. If invalid/expired → 401 Unauthorized (guard handles this)
 *
 * WHY VALIDATE RETURNS A MINIMAL OBJECT?
 * We don't query the DB in validate() by design.
 * The JWT contains all the claims we need (sub, email, organizationId, role).
 * Querying the DB on every request would defeat the purpose of JWTs
 * (stateless — no DB hit required for auth verification).
 *
 * TRADE-OFF:
 * If a user is deleted or loses their role, their access token is still valid
 * until it expires (15 minutes). This is the JWT trade-off.
 * Solutions:
 * 1. Short access token lifetime (15 min — what we use)
 * 2. JWT blocklist in Redis (for security-critical revocations)
 * 3. Include a 'jti' (JWT ID) claim and check a Redis blocklist
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { OrganizationMemberRole } from '@prisma/client';

import { JwtPayload } from '../auth.service';
import { DatabaseService } from '../../database/database.service';

// This is what gets attached to req.user after JWT validation
export interface RequestUser {
  userId: string;
  email: string;
  organizationId: string;
  role: OrganizationMemberRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      // Extract JWT from Authorization: Bearer <token> header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // If true, expired tokens would still be validated (insecure!)
      ignoreExpiration: false,

      // The secret used to verify the signature
      // Must match the secret used to sign the token
      secretOrKey: config.get<string>('jwt.accessSecret', 'dev-secret-change-in-production'),
    });
  }

  /**
   * Called after passport-jwt verifies the token signature and expiry.
   * Whatever we return here becomes req.user.
   *
   * One indexed lookup per request keeps membership and role authoritative.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (!payload.sub || !payload.email || !payload.organizationId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // The role claim is a snapshot from when the token was issued. Read the live
    // membership so a removed member loses access, and a role change applies,
    // immediately instead of when the 15-minute token expires.
    const membership = await this.db.organizationMember.findUnique({
      where: { userId_organizationId: { userId: payload.sub, organizationId: payload.organizationId } },
      select: { role: true },
    });
    if (!membership) {
      throw new UnauthorizedException('You are no longer a member of this organization');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: membership.role,
    };
  }
}
