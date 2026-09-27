/**
 * DocumentProcessingModule — handles the document ingestion pipeline.
 *
 * Pipeline stages:
 * 1. Text extraction (PDF → text, DOCX → text, etc.)
 * 2. Text chunking (recursive character splitter)
 * 3. Embedding generation (via AI provider)
 * 4. Vector storage in PostgreSQL (pgvector)
 * 5. Status updates in database
 *
 * Queue: 'document-processing'
 * Job types: 'extract-text', 'chunk-text', 'generate-embeddings', 'store-chunks'
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { DOCUMENT_PROCESSING_QUEUE } from './document-processing.constants';
import { DocumentProcessingConsumer } from './document-processing.consumer';
import { DocumentProcessingService } from './document-processing.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DOCUMENT_PROCESSING_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,   // Keep last 100 completed jobs
        removeOnFail: 500,       // Keep last 500 failed jobs for debugging
      },
    }),
  ],
  providers: [DocumentProcessingConsumer, DocumentProcessingService],
  exports: [BullModule],
})
export class DocumentProcessingModule {}
