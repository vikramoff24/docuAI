/**
 * Environment variable validation using Zod.
 *
 * This runs at application startup (before any module is initialized).
 * If required environment variables are missing, the app throws immediately
 * with a clear error message rather than failing mysteriously at runtime.
 *
 * WHY FAIL FAST?
 * Imagine deploying to production and your JWT_ACCESS_SECRET is missing.
 * Without validation: the app starts, looks healthy, then crashes on the
 * first login attempt with a cryptic "Cannot read property of undefined".
 * With validation: the app refuses to start with "Missing JWT_ACCESS_SECRET".
 */

import { z } from 'zod';

const configSchema = z.object({
  // Required in all environments
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Optional with defaults (validated for type correctness)
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // JWT — required in production, optional in dev (we'll warn)
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').optional(),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Redis
  REDIS_URL: z.string().default('redis://:redis_secret@localhost:6379'),

  // Storage
  STORAGE_ENDPOINT: z.string().default('http://localhost:4566'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY_ID: z.string().default('test'),
  STORAGE_SECRET_ACCESS_KEY: z.string().default('test'),
  STORAGE_BUCKET: z.string().default('docuflow-dev'),
  STORAGE_FORCE_PATH_STYLE: z.string().default('true'),
  // Address browsers use for presigned upload/download URLs, when it differs from
  // STORAGE_ENDPOINT (e.g. internal http://minio:9000 vs public https://s3.example.com)
  STORAGE_PUBLIC_ENDPOINT: z.string().url().optional(),

  // AI (optional — not required if AI features not used)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_DEFAULT_PROVIDER: z.enum(['openai', 'anthropic', 'google']).default('openai'),
  // Encrypts organization API keys set in Settings (32 bytes, base64 or hex).
  // Must be identical for the API and the worker. Generate: openssl rand -base64 32
  AI_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Bcrypt
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(10),

  // Rate limiting: every limit is multiplied by this. 1 = production limits,
  // larger relaxes them (E2E suites, many requests from one IP), 0 disables.
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(0).default(1),

  // Which proxies may set X-Forwarded-For (client IP for rate limits and audit).
  // 'loopback' trusts only a proxy on the same host (the Next.js rewrite proxy in dev).
  // Behind a load balancer: its hop count (e.g. '1') or its addresses/CIDRs, comma-separated.
  // 'true' trusts any sender — then anyone can spoof their IP and dodge rate limits.
  TRUST_PROXY: z.string().default('loopback'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration. Check the logs above.');
  }

  // Production never runs on the built-in development secrets: a missing
  // JWT_ACCESS_SECRET would let anyone forge access tokens.
  if (result.data.NODE_ENV === 'production') {
    const missing = (['JWT_ACCESS_SECRET', 'AI_CREDENTIALS_ENCRYPTION_KEY'] as const).filter((k) => !result.data[k]);
    if (missing.length) {
      throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
    }
  }

  // Warn about missing JWT secrets in non-test environments
  if (result.data.NODE_ENV !== 'test') {
    if (!result.data.JWT_ACCESS_SECRET) {
      console.warn('⚠️  JWT_ACCESS_SECRET not set. Using insecure default for development only!');
    }
    if (!result.data.JWT_REFRESH_SECRET) {
      console.warn('⚠️  JWT_REFRESH_SECRET not set. Using insecure default for development only!');
    }
    if (!result.data.AI_CREDENTIALS_ENCRYPTION_KEY) {
      console.warn(
        result.data.NODE_ENV === 'production'
          ? '⚠️  AI_CREDENTIALS_ENCRYPTION_KEY not set. Organizations cannot store API keys in Settings.'
          : '⚠️  AI_CREDENTIALS_ENCRYPTION_KEY not set. Using an insecure development key for stored API keys!',
      );
    }
  }

  return result.data;
}
