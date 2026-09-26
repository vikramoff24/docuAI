/**
 * Application configuration using @nestjs/config.
 *
 * All environment variables are typed and validated here.
 * Never read process.env directly in services — always use ConfigService.
 *
 * WHY?
 * 1. Type safety (ConfigService.get<number>('PORT') returns number)
 * 2. Validation at startup (fail fast, not at runtime)
 * 3. Centralized documentation of what the app needs
 * 4. Easy to mock in tests
 */

export default () => ({
  // Server
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  // Database
  database: {
    url: process.env['DATABASE_URL'],
  },

  // Redis
  redis: {
    url: process.env['REDIS_URL'] ?? 'redis://:redis_secret@localhost:6379',
  },

  // JWT
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
    accessExpiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
    refreshSecret: process.env['JWT_REFRESH_SECRET'],
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',
  },

  // Storage (S3 / LocalStack)
  storage: {
    endpoint: process.env['STORAGE_ENDPOINT'] ?? 'http://localhost:4566',
    region: process.env['STORAGE_REGION'] ?? 'us-east-1',
    accessKeyId: process.env['STORAGE_ACCESS_KEY_ID'] ?? 'test',
    secretAccessKey: process.env['STORAGE_SECRET_ACCESS_KEY'] ?? 'test',
    bucket: process.env['STORAGE_BUCKET'] ?? 'docuflow-dev',
    forcePathStyle: process.env['STORAGE_FORCE_PATH_STYLE'] === 'true' || true,
  },

  // AI Providers
  ai: {
    openai: {
      apiKey: process.env['OPENAI_API_KEY'],
      defaultModel: process.env['OPENAI_DEFAULT_MODEL'] ?? 'gpt-4o-mini',
      embeddingModel: process.env['OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    },
    anthropic: {
      apiKey: process.env['ANTHROPIC_API_KEY'],
      defaultModel: process.env['ANTHROPIC_DEFAULT_MODEL'] ?? 'claude-3-5-sonnet-20241022',
    },
    defaultProvider: process.env['AI_DEFAULT_PROVIDER'] ?? 'openai',
  },

  // CORS
  allowedOrigins: process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000',

  // Bcrypt
  bcryptSaltRounds: parseInt(process.env['BCRYPT_SALT_ROUNDS'] ?? '10', 10),
});
