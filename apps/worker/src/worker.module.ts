/**
 * WorkerModule — Root module for the background job processing service.
 *
 * Connects to Redis for BullMQ queues and PostgreSQL via Prisma.
 * Registers all job processor modules.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

import { DocumentProcessingModule } from './document-processing/document-processing.module';

@Module({
  imports: [
    // ── Config ──────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── BullMQ / Redis ───────────────────────────────────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379',
        );

        // Parse redis URL (format: redis://:password@host:port)
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
            retryStrategy: (times: number) => {
              // Reconnect with exponential backoff (max 30s)
              return Math.min(times * 500, 30000);
            },
          },
        };
      },
    }),

    // ── Feature Modules ──────────────────────────────────────
    DocumentProcessingModule,
  ],
})
export class WorkerModule {}
