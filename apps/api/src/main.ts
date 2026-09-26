/**
 * DocuFlow AI — NestJS Application Entry Point
 *
 * This file bootstraps the NestJS application with:
 * 1. Fastify as the HTTP adapter (faster than Express)
 * 2. Global validation pipe (class-validator)
 * 3. Global exception filter (consistent error format)
 * 4. Swagger/OpenAPI documentation
 * 5. Security headers (helmet)
 * 6. CORS configuration
 * 7. Graceful shutdown handling
 *
 * ────────────────────────────────────────────────────────
 * WHY FASTIFY OVER EXPRESS?
 * ────────────────────────────────────────────────────────
 * Fastify benchmarks consistently show 2-3x higher throughput than Express
 * for typical JSON API workloads. Both are production-ready.
 * NestJS supports both; we pick Fastify for better performance at no DX cost.
 * The main trade-off: some Express-specific middleware won't work.
 * Solution: Fastify has equivalent plugins for everything we need.
 */

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ──────────────────────────────────────────────────────
  // Create NestJS app with Fastify adapter
  // ──────────────────────────────────────────────────────
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false, // We use our own logger (pino via NestJS logger)
      trustProxy: true, // Required if behind a load balancer (to get real IP)
    }),
    {
      bufferLogs: true, // Buffer logs until our custom logger is attached
    },
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // ──────────────────────────────────────────────────────
  // Register Fastify plugins
  // ──────────────────────────────────────────────────────
  // Helmet: security headers (X-Frame-Options, X-XSS-Protection, etc.)
  // await app.register(import('@fastify/helmet'), {
  //   contentSecurityPolicy: nodeEnv === 'production',
  // });

  // ──────────────────────────────────────────────────────
  // CORS
  // ──────────────────────────────────────────────────────
  const allowedOrigins = configService
    .get<string>('ALLOWED_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: nodeEnv === 'development' ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    credentials: true,
  });

  // ──────────────────────────────────────────────────────
  // API Versioning
  // ──────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ──────────────────────────────────────────────────────
  // Global Validation Pipe
  //
  // class-validator + class-transformer work together:
  // 1. transform: true → convert plain JSON to class instances
  // 2. whitelist: true → strip unknown properties (security!)
  // 3. forbidNonWhitelisted: true → throw 400 if unknown props
  // 4. validateCustomDecorators: true → validate @IsOrgMember etc.
  //
  // WHY whitelist + forbidNonWhitelisted?
  // Without these, a client could send extra fields that get saved
  // to the DB (mass assignment vulnerability). Always strip/reject unknowns.
  // ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validateCustomDecorators: true,
      errorHttpStatusCode: 422,
    }),
  );

  // ──────────────────────────────────────────────────────
  // Global Exception Filter
  // Converts any thrown exception into a consistent JSON error shape:
  // { statusCode, error, message, requestId, timestamp }
  // ──────────────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ──────────────────────────────────────────────────────
  // Global Interceptors
  // ──────────────────────────────────────────────────────
  app.useGlobalInterceptors(
    new LoggingInterceptor(),    // Log every request/response
    new TransformInterceptor(),  // Wrap responses in { data, meta } shape
  );

  // ──────────────────────────────────────────────────────
  // Swagger / OpenAPI Documentation
  // Available at /api/docs in non-production environments
  // ──────────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DocuFlow AI API')
      .setDescription('Enterprise Document Management System with AI capabilities')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('auth', 'Authentication and authorization')
      .addTag('organizations', 'Organization management')
      .addTag('users', 'User management')
      .addTag('documents', 'Document management')
      .addTag('folders', 'Folder management')
      .addTag('search', 'Document search')
      .addTag('ai', 'AI features (summaries, Q&A)')
      .addTag('agent', 'AI document management agent')
      .addTag('audit', 'Audit logs')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  // ──────────────────────────────────────────────────────
  // Graceful Shutdown
  //
  // WHY GRACEFUL SHUTDOWN?
  // When Kubernetes (or Docker) kills a container, it sends SIGTERM.
  // Without graceful shutdown, in-flight requests are abruptly cut.
  // With enableShutdownHooks(), NestJS:
  // 1. Stops accepting new requests
  // 2. Waits for in-flight requests to complete (up to timeout)
  // 3. Closes database connections (Prisma disconnect)
  // 4. Closes Redis connections
  // 5. Exits cleanly
  // ──────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ──────────────────────────────────────────────────────
  // Start listening
  // '0.0.0.0' → bind to all interfaces (required for Docker)
  // ──────────────────────────────────────────────────────
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 API running on http://localhost:${port}/api/v1`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
}

void bootstrap();
