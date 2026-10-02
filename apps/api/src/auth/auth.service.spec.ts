/**
 * Auth Service Unit Tests
 *
 * Tests the AuthService business logic in isolation.
 * No real database — we mock the DatabaseService.
 *
 * ────────────────────────────────────────────────────────
 * WHY UNIT TEST AUTHSERVICE?
 * ────────────────────────────────────────────────────────
 * AuthService contains critical security logic:
 * - Password hashing
 * - Constant-time comparison (timing attack prevention)
 * - JWT generation
 * - Refresh token rotation
 *
 * These are easily testable with mocks and must be correct.
 * Integration tests will verify the full DB-connected flow.
 *
 * ────────────────────────────────────────────────────────
 * WHAT WE MOCK
 * ────────────────────────────────────────────────────────
 * - DatabaseService: returns predictable test data
 * - JwtService: returns predictable tokens
 * - ConfigService: returns test config values
 *
 * We do NOT mock bcrypt (it's a pure function, testing the real thing is fine)
 * We DO want to test that bcrypt is called with correct arguments.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { OrganizationMemberRole } from '@prisma/client';

import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
import { REDIS_CLIENT } from '../redis/redis.module';

// ────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────
const mockUser = {
  id: 'user-uuid-1',
  email: 'alice@acme.com',
  passwordHash: '$2b$10$hashedpassword',
  firstName: 'Alice',
  lastName: 'Smith',
  emailVerifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  avatarUrl: null,
  memberships: [
    {
      organizationId: 'org-uuid-1',
      role: OrganizationMemberRole.OWNER,
      organization: { id: 'org-uuid-1', name: 'Acme Corp', slug: 'acme-corp' },
    },
  ],
};

// ────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────
const mockDb = {
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  organization: {
    create: jest.fn(),
  },
  organizationMember: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  folder: {
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
    const config: Record<string, unknown> = {
      'bcryptSaltRounds': 10,
      'jwt.accessExpiresIn': '15m',
      'jwt.refreshExpiresIn': '7d',
    };
    return config[key] ?? defaultValue;
  }),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
};

// ────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ──────────────────────────────────────────────
  // Registration Tests
  // ──────────────────────────────────────────────

  describe('register', () => {
    it('should throw ConflictException if email already exists', async () => {
      mockDb.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'alice@acme.com',
          password: 'Password123!',
          firstName: 'Alice',
          lastName: 'Smith',
          organizationName: 'Acme Corp',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockDb.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: { equals: 'alice@acme.com', mode: 'insensitive' } } }),
      );
    });

    it('should create user, organization, and membership in a transaction', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);

      const createdUser = { id: 'new-user-id', email: 'new@acme.com', firstName: 'New', lastName: 'User' };
      const createdOrg = { id: 'new-org-id', name: 'New Org', slug: 'new-org-abc1' };

      mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUser), findUnique: jest.fn() },
          organization: { create: jest.fn().mockResolvedValue(createdOrg) },
          organizationMember: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn(), findUnique: jest.fn() },
          folder: { create: jest.fn().mockResolvedValue({}) },
          refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        };
        return fn(tx as unknown as Parameters<typeof fn>[0]);
      });

      const result = await service.register({
        email: 'new@acme.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'User',
        organizationName: 'New Org',
      });

      expect(result.user).toEqual(createdUser);
      expect(result.organization).toEqual(createdOrg);
    });
  });

  // ──────────────────────────────────────────────
  // Login Tests
  // ──────────────────────────────────────────────

  describe('validateUser', () => {
    it('should throw UnauthorizedException for non-existent user', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);

      await expect(
        service.validateUser('nonexistent@test.com', 'Password123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      // A real bcrypt hash of a DIFFERENT password
      const wrongPasswordUser = {
        ...mockUser,
        passwordHash: '$2b$10$wronghashhere.invalidhashfortesting',
      };
      mockDb.user.findFirst.mockResolvedValue(wrongPasswordUser);

      await expect(
        service.validateUser('alice@acme.com', 'WrongPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ──────────────────────────────────────────────
  // Security Tests
  // ──────────────────────────────────────────────

  describe('security properties', () => {
    it('should NOT reveal whether email exists via error message', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);

      let error: UnauthorizedException | null = null;
      try {
        await service.validateUser('ghost@test.com', 'Password123!');
      } catch (e) {
        error = e as UnauthorizedException;
      }

      expect(error).toBeInstanceOf(UnauthorizedException);
      // Error message should be the same whether email exists or not
      expect(error?.message).toBe('Invalid email or password');
    });

    it('should generate tokens with correct claims', async () => {
      mockDb.refreshToken.create.mockResolvedValue({});

      await service.generateTokens(
        'user-id',
        'alice@acme.com',
        'org-id',
        OrganizationMemberRole.ADMIN,
      );

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-id',
          email: 'alice@acme.com',
          organizationId: 'org-id',
          role: OrganizationMemberRole.ADMIN,
          jti: expect.any(String), // UUID, unique per token
        }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // Refresh Token Tests
  // ──────────────────────────────────────────────

  describe('refreshTokens', () => {
    const TOKEN_ID = '11111111-1111-4111-8111-111111111111';

    it('should issue refresh tokens as "<id>.<secret>" and store the id', async () => {
      mockDb.refreshToken.create.mockResolvedValue({});

      const tokens = await service.generateTokens('user-id', 'a@b.com', 'org-id', OrganizationMemberRole.MEMBER);

      const [id, secret] = tokens.refreshToken.split('.');
      expect(secret).toBeTruthy();
      expect(mockDb.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ id }),
      });
      // Only the secret half is hashed
      const { tokenHash } = mockDb.refreshToken.create.mock.calls[0][0].data;
      expect(await bcrypt.compare(secret, tokenHash)).toBe(true);
    });

    it('should reject malformed tokens without querying the database', async () => {
      await expect(service.refreshTokens('not-a-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens('abc.def')).rejects.toThrow(UnauthorizedException);
      expect(mockDb.refreshToken.findFirst).not.toHaveBeenCalled();
    });

    it('should reject a token whose secret does not match', async () => {
      mockDb.refreshToken.findFirst.mockResolvedValue({
        id: TOKEN_ID,
        userId: 'user-id',
        tokenHash: await bcrypt.hash('real-secret', 4),
        user: mockUser,
      });

      await expect(service.refreshTokens(`${TOKEN_ID}.wrong-secret`)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockDb.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('should look up by id, revoke the old token and issue a new pair', async () => {
      mockDb.refreshToken.findFirst.mockResolvedValue({
        id: TOKEN_ID,
        userId: 'user-id',
        tokenHash: await bcrypt.hash('real-secret', 4),
        user: mockUser,
      });
      mockDb.organizationMember.findFirst.mockResolvedValue({
        organizationId: 'org-id',
        role: OrganizationMemberRole.MEMBER,
      });
      mockDb.refreshToken.create.mockResolvedValue({});
      mockDb.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const tokens = await service.refreshTokens(`${TOKEN_ID}.real-secret`);

      expect(mockDb.refreshToken.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: TOKEN_ID, revokedAt: null }) }),
      );
      expect(mockDb.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: TOKEN_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(tokens.refreshToken).not.toBe(`${TOKEN_ID}.real-secret`);
    });

    it('should reject the loser of two concurrent refreshes with the same token', async () => {
      mockDb.refreshToken.findFirst.mockResolvedValue({
        id: TOKEN_ID,
        userId: 'user-id',
        tokenHash: await bcrypt.hash('real-secret', 4),
        user: mockUser,
      });
      // The other request revoked it between our read and our write
      mockDb.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshTokens(`${TOKEN_ID}.real-secret`)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockDb.refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
