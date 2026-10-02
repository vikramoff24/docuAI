import type { Config } from 'jest';

/**
 * Jest configuration for integration tests.
 *
 * Integration tests run against a real database and test the full
 * HTTP request → controller → service → database round-trip.
 *
 * Requirements:
 * - PostgreSQL must be running (docker compose up -d postgres)
 * - DATABASE_URL or DATABASE_TEST_URL must be set in .env
 *
 * Run: pnpm --filter @docuflow/api test:integration
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.integration\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!**/node_modules/**', '!**/dist/**'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,     // 30s timeout for DB operations
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@prisma/client$': '<rootDir>/../../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client',
  },
};

export default config;
