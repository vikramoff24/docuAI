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
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
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

    // ──────────────────────────────────────────────────
    // Feature Modules
    // ──────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    OrganizationsModule,

    // TODO Phase 2: DocumentsModule, FoldersModule
    // TODO Phase 3: SearchModule
    // TODO Phase 4: AIModule, AgentModule
    // TODO Phase 5: AuditModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
