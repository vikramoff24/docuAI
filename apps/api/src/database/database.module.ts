/**
 * DatabaseModule — Global Prisma client provider
 *
 * ────────────────────────────────────────────────────────
 * WHAT IS PRISMA AND HOW DOES IT CONNECT?
 * ────────────────────────────────────────────────────────
 * Prisma Client is the TypeScript query builder that:
 * 1. Reads your schema.prisma
 * 2. Generates a fully typed client (via `prisma generate`)
 * 3. At runtime, maintains a connection POOL to PostgreSQL
 *
 * WHY A CONNECTION POOL?
 * Opening a TCP connection to Postgres is expensive (~5ms).
 * A pool maintains N open connections and reuses them.
 * Default Prisma pool: min=0, max=CPU count * 2
 *
 * For production:
 * - Use PgBouncer (connection pooler) in front of Postgres
 * - This is critical when running multiple API instances
 *   (each instance has its own pool → too many connections to Postgres)
 * - PgBouncer multiplexes thousands of app connections into tens of DB connections
 *
 * ────────────────────────────────────────────────────────
 * WHY IMPLEMENT OnModuleInit AND OnModuleDestroy?
 * ────────────────────────────────────────────────────────
 * OnModuleInit: Explicitly connect at startup (faster first request)
 * OnModuleDestroy: Disconnect cleanly on shutdown (graceful shutdown)
 *
 * Without OnModuleDestroy: Postgres sees abrupt connection drops → logs errors
 * With OnModuleDestroy: Prisma sends proper connection close → clean shutdown
 */

import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service';

@Global() // Makes DatabaseService available everywhere without importing this module
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
