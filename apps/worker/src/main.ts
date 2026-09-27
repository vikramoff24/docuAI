/**
 * DocuFlow AI — Worker Entry Point
 *
 * This service processes background jobs from BullMQ queues:
 * - document-processing: Text extraction, chunking, embedding generation
 *
 * It does NOT expose an HTTP server in production.
 * In development, we expose a minimal health endpoint for Docker healthchecks.
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');

  const app = await NestFactory.create(WorkerModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Graceful shutdown — important for in-flight job completion
  app.enableShutdownHooks();

  // Minimal HTTP server for health checks / Docker compose healthcheck
  const port = process.env['WORKER_PORT'] ?? 3002;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Worker service started on port ${port}`);
  logger.log(`🌍 Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
  logger.log('📋 Queues: document-processing');
}

void bootstrap();
