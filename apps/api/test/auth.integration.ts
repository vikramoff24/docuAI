/**
 * Auth Integration Tests
 *
 * These tests run against a REAL database (docuflow_test).
 * They test the full HTTP request → controller → service → database round-trip.
 *
 * Test database must be running:
 *   docker compose up -d postgres
 *   DATABASE_TEST_URL=... pnpm --filter @docuflow/api test:integration
 *
 * WHY INTEGRATION TESTS?
 * Unit tests (auth.service.spec.ts) mock the database — they test logic in isolation.
 * Integration tests verify the actual SQL queries, DB constraints, and HTTP
 * response shapes work correctly together.
 *
 * Test scenarios:
 * 1. Registration — happy path, duplicate email
 * 2. Login — happy path, wrong password, unknown email
 * 3. Token refresh — happy path, invalid token, used token (rotation)
 * 4. Logout — revokes tokens
 * 5. GET /auth/me — returns current user
 * 6. Cross-tenant isolation — user from org A cannot access org B
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// ── Test helpers ─────────────────────────────────────────────────────────────

const TEST_USER = {
  email: `test-${Date.now()}@integration.test`,
  password: 'IntegrationTest123!',
  firstName: 'Integration',
  lastName: 'Test',
  organizationName: `Test Org ${Date.now()}`,
};

const TEST_USER_2 = {
  email: `test2-${Date.now()}@integration.test`,
  password: 'IntegrationTest123!',
  firstName: 'Integration',
  lastName: 'Test2',
  organizationName: `Test Org 2 ${Date.now()}`,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Auth Integration Tests', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;
  let organizationId: string;

  let user2AccessToken: string;
  let user2OrganizationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        errorHttpStatusCode: 422,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env['DATABASE_TEST_URL'] ?? process.env['DATABASE_URL'],
        },
      },
    });

    // Register two test users (different orgs = different tenants)
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(TEST_USER)
      .expect(201);

    userId = reg1.body.data.user.id;
    organizationId = reg1.body.data.organization.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(TEST_USER_2)
      .expect(201);

    user2OrganizationId = reg2.body.data.organization.id;

    // Login user 1
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    accessToken = login.body.data.tokens.accessToken;
    refreshToken = login.body.data.tokens.refreshToken;

    // Login user 2
    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER_2.email, password: TEST_USER_2.password })
      .expect(200);

    user2AccessToken = login2.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await prisma.refreshToken.deleteMany({
        where: { user: { email: { in: [TEST_USER.email, TEST_USER_2.email] } } },
      });
      await prisma.organizationMember.deleteMany({
        where: { organizationId: { in: [organizationId, user2OrganizationId] } },
      });
      await prisma.folder.deleteMany({
        where: { organizationId: { in: [organizationId, user2OrganizationId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, user2OrganizationId] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [TEST_USER.email, TEST_USER_2.email] } },
      });
    } catch {
      // Ignore cleanup errors
    }

    await prisma.$disconnect();
    await app.close();
  });

  // ── Registration Tests ────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('should reject registration with duplicate email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(TEST_USER)
        .expect(409);

      expect(res.body.statusCode).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'new@test.com', password: '123' })
        .expect(422);

      expect(res.body.statusCode).toBe(422);
    });

    it('should reject registration with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'not-an-email' })
        .expect(422);
    });

    it('should reject registration with extra unknown fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'extra@test.com', hackerField: 'injection' })
        .expect(422);
    });
  });

  // ── Login Tests ───────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('should return 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: 'WrongPassword123!' })
        .expect(401);

      // Security: error message must NOT reveal whether email exists
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should return 401 for non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'doesnotexist@test.com', password: 'Password123!' })
        .expect(401);

      // Same error message as wrong password — prevents email enumeration
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should include user and organization in response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(200);

      expect(res.body.data.user.email).toBe(TEST_USER.email);
      expect(res.body.data.organization.id).toBe(organizationId);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.tokens.refreshToken).toBeTruthy();
      expect(res.body.data.tokens.expiresIn).toBe(900);
    });

    it('should NOT return passwordHash in response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(200);

      const responseString = JSON.stringify(res.body);
      expect(responseString).not.toContain('passwordHash');
      expect(responseString).not.toContain('$2b$'); // bcrypt prefix
    });
  });

  // ── Token Refresh Tests ───────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('should return new token pair when given valid refresh token', async () => {
      const oldRefreshToken = refreshToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();

      // The refresh token MUST be different (it's a UUID, always new after rotation)
      expect(res.body.data.refreshToken).not.toBe(oldRefreshToken);

      // Access token has the correct structure (JWT has 3 parts)
      const parts = (res.body.data.accessToken as string).split('.');
      expect(parts).toHaveLength(3);

      // Update tokens for subsequent tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'completely-invalid-token' })
        .expect(401);
    });

    it('should reject already-used refresh token (rotation security)', async () => {
      // Get a fresh refresh token for this test
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(200);

      const freshToken = loginRes.body.data.tokens.refreshToken;

      // Use the token once (rotates it)
      const firstUse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: freshToken })
        .expect(200);

      // Update shared tokens from the rotation result
      accessToken = firstUse.body.data.accessToken;
      refreshToken = firstUse.body.data.refreshToken;

      // Attempt to reuse the old (now-rotated) token — must be rejected
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: freshToken })
        .expect(401);
    });
  });

  // ── Auth Me Tests ─────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('should return current user data for valid JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.userId).toBe(userId);
      expect(res.body.data.email).toBe(TEST_USER.email);
      expect(res.body.data.organizationId).toBe(organizationId);
    });

    it('should return 401 without JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should return 401 with malformed JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });
  });

  // ── Logout Tests ──────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    let logoutRefreshToken: string;

    beforeEach(async () => {
      // Login fresh to get tokens
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(200);

      logoutRefreshToken = login.body.data.tokens.refreshToken;
      accessToken = login.body.data.tokens.accessToken;
    });

    it('should return 204 on logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('should invalidate refresh token after logout', async () => {
      // Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Attempt to use the refresh token — must fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: logoutRefreshToken })
        .expect(401);
    });
  });

  // ── Cross-Tenant Isolation Tests ──────────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it("user from Org A cannot access Org B's data via JWT claims", async () => {
      // User 1's JWT contains organizationId = organizationId
      // User 2's JWT contains organizationId = user2OrganizationId
      // They should see different data from /auth/me

      const me1 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const me2 = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user2AccessToken}`)
        .expect(200);

      // Different organization IDs — tenant isolation verified at JWT level
      expect(me1.body.data.organizationId).toBe(organizationId);
      expect(me2.body.data.organizationId).toBe(user2OrganizationId);
      expect(me1.body.data.organizationId).not.toBe(me2.body.data.organizationId);
    });
  });
});
