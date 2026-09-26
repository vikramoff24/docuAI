import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * DatabaseService extends PrismaClient directly.
 * This is the standard pattern for NestJS + Prisma.
 *
 * By extending PrismaClient, DatabaseService IS the Prisma client.
 * Any service that injects DatabaseService can call:
 *   this.db.user.findMany()
 *   this.db.document.create(...)
 *   etc.
 *
 * ALTERNATIVES:
 * 1. Wrap PrismaClient (this.db = new PrismaClient()) — same outcome, extra boilerplate
 * 2. Use @prisma/nestjs-prisma library — similar, but adds a dependency
 *
 * We extend directly for simplicity.
 */
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },   // Logs all SQL queries
        { emit: 'event', level: 'error' },   // Logs query errors
        { emit: 'event', level: 'warn' },    // Logs warnings
      ],
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('Database connected');

    // In development, log slow queries (>100ms)
    if (process.env['NODE_ENV'] === 'development') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.$on as any)('query', (e: { duration: number; query: string }) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query.substring(0, 200)}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Health check helper — used by AppService
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
