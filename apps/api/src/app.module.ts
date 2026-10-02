/**
 * DocuFlow AI — Root Application Module
 *
 * NestJS uses a module system to organize code.
 * The AppModule is the root — it imports all feature modules.
 *
 * ────────────────────────────────────────────────────────
 * HOW NESTJS MODULES WORK
 * ────────────────────────────────────────────────────────
 * Each @Module() declares:
 * - imports:     Other modules whose exported providers this module needs
 * - providers:   Services, guards, etc. registered in this module's DI container
 * - controllers: Route handlers registered with this module
 * - exports:     Providers that OTHER modules can import from this one
 *
 * NestJS uses an IoC (Inversion of Control) container.
 * When you @Inject() something, NestJS figures out the dependency graph
 * and instantiates everything in the right order.
 *
 * ────────────────────────────────────────────────────────
 * GLOBAL vs. FEATURE MODULES
 * ────────────────────────────────────────────────────────
 * ConfigModule, DatabaseModule, and RedisModule are @Global()
 * → you import them once in AppModule, and their exports are available everywhere
 * without explicitly importing them in every feature module.
 *
 * Feature modules (AuthModule, DocumentsModule, etc.) are NOT global.
 * → they must explicitly declare what they need.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InvitationsModule } from './invitations/invitations.module';
import { DocumentsModule } from './documents/documents.module';
import { FoldersModule } from './folders/folders.module';
import { SearchModule } from './search/search.module';
import { AIModule } from './ai/ai.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AgentModule } from './agent/agent.module';
import appConfig from './config/app.config';
import { validateConfig } from './config/config.validation';

@Module({
  imports: [
    // ──────────────────────────────────────────────────
    // Config Module (Global)
    // Loads .env files and validates environment variables.
    // ConfigService is available everywhere without importing this module again.
    //
    // validationSchema ensures the app fails fast if required env vars are missing
    // rather than crashing with a cryptic error at runtime.
    // ──────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateConfig,
      envFilePath: ['.env.local', '.env'],
    }),

    // ──────────────────────────────────────────────────
    // Throttler (Rate Limiting) — Global
    // Backed by Redis (see throttler config in auth module)
    // Default: 100 requests per minute per IP
    // ──────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 second
        limit: 20,   // 20 req/sec burst
      },
      {
        name: 'medium',
        ttl: 60000,  // 1 minute
        limit: 300,  // 300 req/min sustained
      },
    ]),

    // ──────────────────────────────────────────────────
    // Infrastructure Modules (Global)
    // ──────────────────────────────────────────────────
    DatabaseModule,  // Prisma client (global)
    RedisModule,     // Redis client (global) — used for token blacklisting, rate limit data

    // ──────────────────────────────────────────────────
    // BullMQ (Global Redis connection for queues)
    // Used by DocumentsModule to enqueue processing jobs.
    // The worker reads from the same Redis queues.
    // ──────────────────────────────────────────────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'redis.url',
          'redis://:redis_secret@localhost:6379',
        );

        // Parse Redis URL (format: redis://:password@host:port)
        let host = 'localhost';
        let port = 6379;
        let password: string | undefined;

        try {
          const url = new URL(redisUrl);
          host = url.hostname;
          port = parseInt(url.port || '6379', 10);
          if (url.password) {
            password = decodeURIComponent(url.password);
          }
        } catch {
          // Fallback to defaults if URL parsing fails
        }

        return {
          redis: {
            host,
            port,
            password,
            retryStrategy: (times: number) => Math.min(times * 500, 30000),
          },
        };
      },
    }),

    // ──────────────────────────────────────────────────
    // Feature Modules
    // ──────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    OrganizationsModule,
    InvitationsModule,
    DocumentsModule,
    FoldersModule,
    SearchModule,
    AIModule,
    ConversationsModule,
    AgentModule,

    // TODO Phase 5: AuditModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
