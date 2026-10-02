/**
 * Rate limiting (production limits, multiplier 1).
 *
 * Counters live in Redis and outlive a test run, so each test uses its own
 * client IP via X-Forwarded-For. That header is honoured only because the app
 * trusts loopback proxies (TRUST_PROXY=loopback, like the Next.js proxy in dev)
 * and supertest connects from 127.0.0.1. The last test checks that an app that
 * doesn't trust the sender ignores the header, so it can't be used to dodge limits.
 */
import { randomInt } from 'crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import Redis from 'ioredis';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ROUTE_LIMITS } from '../src/common/rate-limit/rate-limit';
import { REDIS_CLIENT } from '../src/redis/redis.module';

async function createApp(trustProxy: boolean | string): Promise<NestFastifyApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ trustProxy }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, errorHttpStatusCode: 422 }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** A fresh documentation-range IP (RFC 5737) per test, so Redis counters never collide. */
const freshIp = () => `198.51.${randomInt(0, 255)}.${randomInt(1, 254)}`;

const badLogin = { email: 'nobody@rate-limit.test', password: 'WrongPassword123!' };

describe('Rate limiting', () => {
  let app: NestFastifyApplication;
  const previousMultiplier = process.env.RATE_LIMIT_MULTIPLIER;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MULTIPLIER = '1';
    app = await createApp('loopback');
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_MULTIPLIER = previousMultiplier;
    await app.close();
  });

  it('blocks login after the per-IP limit with 429, Retry-After and a readable message', async () => {
    const ip = freshIp();
    const { limit } = ROUTE_LIMITS.login;

    for (let i = 0; i < limit; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send(badLogin)
        .expect(401);
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send(badLogin)
      .expect(429);

    expect(Number(blocked.headers['retry-after-sustained'])).toBeGreaterThan(0);
    expect(blocked.body.message).toMatch(/Too many requests\. Please wait \d+ seconds/);

    // A different client is unaffected
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', freshIp())
      .send(badLogin)
      .expect(401);
  });

  it('keeps a separate bucket per route (blocked login does not block registration)', async () => {
    const ip = freshIp();
    for (let i = 0; i <= ROUTE_LIMITS.login.limit; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Forwarded-For', ip).send(badLogin);
    }
    // Invalid body → 422 from validation, which runs after the throttler: not 429
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', ip)
      .send({})
      .expect(422);
  });

  it('limits the public invitation preview endpoint', async () => {
    const ip = freshIp();
    const { limit } = ROUTE_LIMITS.invitationPreview;
    const statuses: number[] = [];
    for (let i = 0; i <= limit; i++) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invitations/preview')
        .query({ token: `probe-${i}` })
        .set('X-Forwarded-For', ip);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, limit)).not.toContain(429);
    expect(statuses[limit]).toBe(429);
  });

  it('exposes rate-limit headers on normal responses and never limits the health check', async () => {
    const ip = freshIp();
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send(badLogin);
    expect(res.headers['x-ratelimit-limit-sustained']).toBe(String(ROUTE_LIMITS.login.limit));
    expect(res.headers['x-ratelimit-remaining-sustained']).toBe(String(ROUTE_LIMITS.login.limit - 1));

    const health = await request(app.getHttpServer()).get('/api/v1/health').set('X-Forwarded-For', ip);
    expect(health.headers['x-ratelimit-limit-sustained']).toBeUndefined();
  });

  it('scales limits with RATE_LIMIT_MULTIPLIER and disables them at 0', async () => {
    const ip = freshIp();
    process.env.RATE_LIMIT_MULTIPLIER = '2';
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send(badLogin);
      expect(res.headers['x-ratelimit-limit-sustained']).toBe(String(ROUTE_LIMITS.login.limit * 2));

      process.env.RATE_LIMIT_MULTIPLIER = '0';
      const off = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send(badLogin);
      expect(off.headers['x-ratelimit-limit-sustained']).toBeUndefined();
    } finally {
      process.env.RATE_LIMIT_MULTIPLIER = '1';
    }
  });

  it('ignores X-Forwarded-For from an untrusted sender (no bypass by rotating the header)', async () => {
    const untrusted = await createApp(false);
    const redis = untrusted.get<Redis>(REDIS_CLIENT);
    try {
      // The untrusted app sees every request as 127.0.0.1; start from a clean slate for it
      const keys = await redis.keys('throttle:sustained:*');
      if (keys.length) await redis.del(...keys);

      const statuses: number[] = [];
      for (let i = 0; i <= ROUTE_LIMITS.login.limit; i++) {
        const res = await request(untrusted.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', freshIp())
          .send(badLogin);
        statuses.push(res.status);
      }
      expect(statuses[ROUTE_LIMITS.login.limit]).toBe(429);
    } finally {
      const keys = await redis.keys('throttle:sustained:*');
      if (keys.length) await redis.del(...keys);
      await untrusted.close();
    }
  });
});
