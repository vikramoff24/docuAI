/**
 * DocumentProcessingConsumer — BullMQ job processor for document ingestion.
 *
 * This processor handles the full document pipeline:
 * 1. Receives 'process-document' job with documentId
 * 2. Calls DocumentProcessingService to orchestrate the pipeline
 * 3. Updates document status at each stage
 *
 * Job payload interface: ProcessDocumentJobData
 *
 * WHY SEPARATE CONSUMER AND SERVICE?
 * The consumer handles BullMQ-specific concerns (job lifecycle, progress updates,
 * error reporting). The service contains the actual business logic and can be
 * unit-tested independently without a real queue.
 */

import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  OnQueueStalled,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

import {
  DOCUMENT_PROCESSING_QUEUE,
  DocumentProcessingJobs,
} from './document-processing.constants';
import { DocumentProcessingService, ExtractionError } from './document-processing.service';

export interface ProcessDocumentJobData {
  documentId: string;
  organizationId: string;
  s3Key: string;
  mimeType: string;
  fileName: string;
}

@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessingConsumer {
  private readonly logger = new Logger(DocumentProcessingConsumer.name);

  constructor(
    private readonly processingService: DocumentProcessingService,
  ) {}

  /**
   * Main document processing job.
   * Orchestrates the full pipeline: extract → chunk → embed → store.
   */
  @Process(DocumentProcessingJobs.PROCESS_DOCUMENT)
  async handleProcessDocument(job: Job<ProcessDocumentJobData>): Promise<void> {
    const { documentId, organizationId, s3Key, mimeType, fileName } = job.data;

    this.logger.log(
      `Starting pipeline for document: ${documentId} (${fileName})`,
    );

    if (!(await this.processingService.isDocumentProcessable(documentId))) {
      this.logger.warn(`Skipping document ${documentId}: deleted before processing`);
      return;
    }

    try {
      // Stage 1: Extract text
      await job.progress(10);
      const text = await this.processingService.extractText(
        s3Key,
        mimeType,
        fileName,
      );

      await job.progress(35);
      this.logger.log(
        `Extracted ${text.length} characters from document: ${documentId}`,
      );

      // Stage 2: Chunk text
      const chunks = await this.processingService.chunkText(text, documentId);
      await job.progress(55);
      this.logger.log(
        `Created ${chunks.length} chunks for document: ${documentId}`,
      );

      // Stage 3: Generate embeddings (skipped when the org has no OpenAI key)
      const chunksWithEmbeddings = await this.processingService.generateEmbeddings(
        chunks,
        documentId,
        organizationId,
      );
      await job.progress(80);
      this.logger.log(
        `Generated embeddings for ${chunksWithEmbeddings.length} chunks: ${documentId}`,
      );

      // Stage 4: Store chunks in database
      await this.processingService.storeChunks(
        chunksWithEmbeddings,
        documentId,
        organizationId,
      );
      await job.progress(100);

      this.logger.log(`✅ Pipeline complete for document: ${documentId}`);
    } catch (error) {
      this.logger.error(
        `Pipeline failed for document: ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Mark document as failed in database
      // Only the last attempt marks the document FAILED; earlier ones leave it
      // PROCESSING so the UI doesn't flip to "Failed" and back while retrying.
      // Unreadable files fail the same way on every attempt, so don't retry them.
      const permanent = error instanceof ExtractionError;
      if (permanent) await job.discard();
      const isLastAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt && (await this.processingService.isDocumentProcessable(documentId))) {
        await this.processingService
          .markDocumentFailed(documentId, error instanceof Error ? error.message : 'Unknown error')
          .catch((e) =>
            this.logger.error('Failed to mark document as failed', e),
          );
      }
      throw error; // Re-throw so BullMQ retries the job
    }
  }

  // ── Queue Lifecycle Hooks ────────────────────────────────────────────────

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(
      `Job ${job.id} (${job.name}) started — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} (${job.name}) completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  @OnQueueStalled()
  onStalled(job: Job) {
    this.logger.warn(
      `Job ${job.id} (${job.name}) stalled — will be retried`,
    );
  }
}
