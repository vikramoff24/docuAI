/**
 * DocumentProcessingService — Phase 3 document ingestion pipeline.
 *
 * Full pipeline:
 *   1. extractText()   — Download from S3, parse based on MIME type
 *   2. chunkText()     — Split into overlapping 1000-char chunks
 *   3. generateEmbeddings() — Call OpenAI text-embedding-3-small (org key from Settings, else OPENAI_API_KEY)
 *   4. storeChunks()   — Bulk-insert DocumentChunk records + update doc status to READY
 *
 * WHY NOT USE LANGCHAIN?
 * LangChain adds 50MB+ to bundle size and hides control flow.
 * Our custom implementation is ~200 lines, fully typed, and easier to debug.
 *
 * EMBEDDING STRATEGY:
 * - We batch embeddings 100 chunks at a time to avoid hitting rate limits.
 * - If OPENAI_API_KEY is not set, embeddings are skipped (null) and stored.
 * - pgvector still indexes the embedding column (NULLs are skipped in HNSW).
 * - Semantic search simply won't work until embeddings are generated.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { DocumentStatus } from '@prisma/client';
import { WorkerAiCredentialsService } from '../ai/worker-ai-credentials.service';
import { WorkerDatabaseService } from '../database/worker-database.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  startChar: number;
  endChar: number;
}

export interface ChunkWithEmbedding extends TextChunk {
  embedding: number[] | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 1000;            // characters per chunk
const CHUNK_OVERLAP = 200;          // characters of overlap between adjacent chunks
const EMBEDDING_BATCH_SIZE = 100;   // chunks per OpenAI embedding API call
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;  // text-embedding-3-small dimensions

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * The file itself can't be turned into text (corrupt, encrypted, scanned image…).
 * Retrying won't help, so the consumer fails the document immediately.
 */
export class ExtractionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ExtractionError';
  }
}

function requireText(text: string, fileName: string): string {
  if (!text.trim()) {
    throw new ExtractionError(`No text found in "${fileName}" — scanned or image-only files are not supported yet`);
  }
  return text;
}

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly db: WorkerDatabaseService,
    config: ConfigService,
    private readonly credentials: WorkerAiCredentialsService,
  ) {
    const endpoint = config.get<string>('STORAGE_ENDPOINT', 'http://localhost:4566');
    const region = config.get<string>('STORAGE_REGION', 'us-east-1');
    const accessKeyId = config.get<string>('STORAGE_ACCESS_KEY_ID', 'test');
    const secretAccessKey = config.get<string>('STORAGE_SECRET_ACCESS_KEY', 'test');

    this.bucket = config.get<string>('STORAGE_BUCKET', 'docuflow-dev');

    this.s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 1: Extract text from document stored in S3
  // ──────────────────────────────────────────────────────────────────────────

  async extractText(s3Key: string, mimeType: string, fileName: string): Promise<string> {
    // Postgres text columns reject NUL bytes, which PDFs and mislabeled
    // binaries regularly contain — one would fail the whole document.
    return (await this.extractRawText(s3Key, mimeType, fileName)).replace(/\u0000/g, '');
  }

  private async extractRawText(s3Key: string, mimeType: string, fileName: string): Promise<string> {
    this.logger.debug(`Extracting text from: ${fileName} (${mimeType})`);

    // Download file from S3
    const fileBuffer = await this.downloadFromS3(s3Key);

    // Extract text based on MIME type
    switch (mimeType) {
      case 'application/pdf':
        return this.extractPdfText(fileBuffer, fileName);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return this.extractDocxText(fileBuffer, fileName);

      case 'text/plain':
      case 'text/markdown':
      case 'text/csv':
        return fileBuffer.toString('utf-8');

      default:
        this.logger.warn(
          `No text extractor for MIME type: ${mimeType}. Storing empty content.`,
        );
        return `[Binary file: ${fileName}. Text extraction not supported for ${mimeType}.]`;
    }
  }

  private async downloadFromS3(s3Key: string): Promise<Buffer> {
    const response = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    }));

    if (!response.Body) {
      throw new Error(`S3 object has no body: ${s3Key}`);
    }

    // Collect stream into buffer
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText({ pageJoiner: '' });
      this.logger.debug(`PDF: ${result.total} pages, ${result.text.length} chars from ${fileName}`);
      return requireText(result.text, fileName);
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError(`Could not read PDF "${fileName}" — the file may be corrupt or password-protected`, err);
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async extractDocxText(buffer: Buffer, fileName: string): Promise<string> {
    let value: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth');
      ({ value } = await mammoth.extractRawText({ buffer }));
    } catch (err) {
      throw new ExtractionError(`Could not read Word document "${fileName}" — the file may be corrupt`, err);
    }
    this.logger.debug(`DOCX: ${value.length} chars from ${fileName}`);
    return requireText(value, fileName);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 2: Split text into overlapping chunks
  // ──────────────────────────────────────────────────────────────────────────

  async chunkText(text: string, documentId: string): Promise<TextChunk[]> {
    this.logger.debug(`Chunking ${text.length} chars for document: ${documentId}`);

    if (text.trim().length === 0) {
      this.logger.warn(`Empty text for document: ${documentId}. Creating single empty chunk.`);
      return [{
        content: '[No text content extracted]',
        chunkIndex: 0,
        tokenCount: 0,
        startChar: 0,
        endChar: 0,
      }];
    }

    const chunks: TextChunk[] = [];
    let startChar = 0;
    let chunkIndex = 0;

    while (startChar < text.length) {
      const endChar = Math.min(startChar + CHUNK_SIZE, text.length);
      const content = text.slice(startChar, endChar).trim();

      if (content.length > 0) {
        chunks.push({
          content,
          chunkIndex,
          // Rough estimate: 1 token ≈ 4 characters (English text)
          tokenCount: Math.ceil(content.length / 4),
          startChar,
          endChar,
        });
        chunkIndex++;
      }

      // Advance by CHUNK_SIZE - CHUNK_OVERLAP for overlap
      startChar += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    this.logger.debug(`Created ${chunks.length} chunks for document: ${documentId}`);
    return chunks;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 3: Generate embeddings via OpenAI
  // ──────────────────────────────────────────────────────────────────────────

  async generateEmbeddings(
    chunks: TextChunk[],
    documentId: string,
    organizationId: string,
  ): Promise<ChunkWithEmbedding[]> {
    // The org's own key (Settings) takes precedence over OPENAI_API_KEY.
    const resolved = chunks.length > 0 ? await this.credentials.resolveOpenAIKey(organizationId) : null;
    if (!resolved) {
      this.logger.warn(
        `Skipping embeddings for ${documentId}: ${chunks.length === 0 ? 'no chunks' : 'no OpenAI key configured'}`,
      );
      return chunks.map((c) => ({ ...c, embedding: null }));
    }

    this.logger.debug(
      `Generating embeddings for ${chunks.length} chunks (document: ${documentId})`,
    );

    const results: ChunkWithEmbedding[] = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const embeddings = await this.callOpenAIEmbeddings(batch.map((c) => c.content), resolved.apiKey);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: embeddings[j] ?? null,
        });
      }

      this.logger.debug(
        `Embedded batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE)}`,
      );
    }

    return results;
  }

  private async callOpenAIEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: OPENAI_EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to ensure order matches input
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  /**
   * False when the document was hard- or soft-deleted after the job was queued.
   * Processing it would waste work (and embedding spend) or hit an FK violation.
   */
  async isDocumentProcessable(documentId: string): Promise<boolean> {
    const doc = await this.db.document.findUnique({
      where: { id: documentId },
      select: { deletedAt: true },
    });
    return doc !== null && doc.deletedAt === null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 4: Store chunks in DB + update document status
  // ──────────────────────────────────────────────────────────────────────────

  async storeChunks(
    chunks: ChunkWithEmbedding[],
    documentId: string,
    organizationId: string,
  ): Promise<void> {
    this.logger.log(
      `Storing ${chunks.length} chunks for document: ${documentId} (org: ${organizationId})`,
    );

    // Bulk-insert all chunks in a transaction
    await this.db.$transaction(async (tx) => {
      // Delete any existing chunks (in case of retry/reprocessing)
      await tx.documentChunk.deleteMany({ where: { documentId } });

      // Insert new chunks (without embedding — Prisma doesn't support vector type)
      await tx.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId,
          organizationId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          metadata: {
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            hasEmbedding: chunk.embedding !== null,
          },
        })),
      });

      // Update document status to READY
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.READY,
          processingError: null,
        },
      });
    });

    // Update embeddings via raw SQL (pgvector type not supported by Prisma createMany)
    // We do this outside the transaction because it's a separate UPDATE pass
    // This is safe because: if it fails, chunks still exist (status = READY)
    // and semantic search simply won't find this document (degrades gracefully)
    const chunksWithEmbeddings = chunks.filter((c) => c.embedding !== null);
    if (chunksWithEmbeddings.length > 0) {
      await this.updateEmbeddings(documentId, chunksWithEmbeddings);
    }

    this.logger.log(
      `✅ Stored ${chunks.length} chunks (${chunksWithEmbeddings.length} with embeddings), document ${documentId} → READY`,
    );
  }

  /**
   * Update embedding vectors via raw SQL.
   * pgvector does not have a Prisma-native type, so we use $executeRawUnsafe.
   *
   * We update by (documentId, chunkIndex) since we just inserted by those keys.
   */
  private async updateEmbeddings(
    documentId: string,
    chunks: ChunkWithEmbedding[],
  ): Promise<void> {
    this.logger.debug(
      `Updating ${chunks.length} embeddings for document: ${documentId}`,
    );

    // Process in batches to avoid huge query strings
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      for (const chunk of batch) {
        if (!chunk.embedding) continue;
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
        try {
          await this.db.$executeRaw`
            UPDATE "document_chunks"
            SET "embedding" = ${vectorLiteral}::vector
            WHERE "documentId" = ${documentId}::uuid
              AND "chunkIndex" = ${chunk.chunkIndex}`;
        } catch (err) {
          // Log but don't fail — chunk is stored, just without embedding
          this.logger.warn(
            `Failed to update embedding for chunk ${chunk.chunkIndex} of doc ${documentId}: ${err}`,
          );
        }
      }
    }

    this.logger.debug(
      `Updated embeddings for ${chunks.length} chunks of document: ${documentId}`,
    );
  }


  // ──────────────────────────────────────────────────────────────────────────
  // ERROR HANDLER: Mark document as FAILED
  // ──────────────────────────────────────────────────────────────────────────

  async markDocumentFailed(documentId: string, errorMessage: string): Promise<void> {
    this.logger.warn(`Marking document ${documentId} as FAILED: ${errorMessage}`);

    await this.db.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.FAILED,
        processingError: errorMessage.slice(0, 1000), // Truncate to fit column
      },
    });
  }
}
