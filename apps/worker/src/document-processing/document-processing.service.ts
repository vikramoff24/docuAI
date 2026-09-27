/**
 * DocumentProcessingService — core business logic for document ingestion.
 *
 * This service is intentionally kept separate from BullMQ concerns so it
 * can be unit-tested without a real queue.
 *
 * Current implementation has PLACEHOLDER behavior for AI-dependent stages
 * (embedding generation). These will be filled in during Phase 3 when the
 * `packages/ai` abstraction layer is built.
 */

import { Injectable, Logger } from '@nestjs/common';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  startChar: number;
  endChar: number;
}

export interface ChunkWithEmbedding extends TextChunk {
  embedding: number[] | null; // null = embedding not yet generated
}

// ── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 1000;        // characters per chunk
const CHUNK_OVERLAP = 200;      // overlap between adjacent chunks
// EMBEDDING_DIMENSIONS = 1536; // OpenAI text-embedding-3-small — used in Phase 3 embeddings

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  /**
   * Stage 1: Extract text from a document stored in S3.
   *
   * CURRENT STATE: Returns a placeholder text for development.
   * PHASE 3 IMPLEMENTATION: Will download from S3 and use:
   *   - pdf-parse for PDF files
   *   - mammoth for DOCX
   *   - Plain text for .txt, .md files
   *   - officeparser for PPTX, XLSX
   */
  async extractText(
    s3Key: string,
    mimeType: string,
    fileName: string,
  ): Promise<string> {
    this.logger.debug(`Extracting text from: ${fileName} (${mimeType})`);

    // TODO Phase 3: Download from S3 and extract based on mimeType
    // For now, return placeholder text for scaffold purposes
    return `[PLACEHOLDER: Text extracted from ${fileName} (${s3Key})]
    
This is where the full extracted text content will appear in Phase 3 when we implement:
- S3 download via AWS SDK
- PDF text extraction with pdf-parse
- DOCX extraction with mammoth
- Image OCR with Tesseract.js (future phase)

File: ${fileName}
MIME Type: ${mimeType}
S3 Key: ${s3Key}`;
  }

  /**
   * Stage 2: Split text into overlapping chunks suitable for embedding.
   *
   * Uses a simple character-based chunker with overlap.
   * Phase 3 will upgrade to a recursive character splitter that respects
   * sentence and paragraph boundaries.
   */
  async chunkText(text: string, documentId: string): Promise<TextChunk[]> {
    this.logger.debug(
      `Chunking ${text.length} characters for document: ${documentId}`,
    );

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
          tokenCount: Math.ceil(content.length / 4), // Rough estimate: 1 token ≈ 4 chars
          startChar,
          endChar,
        });
        chunkIndex++;
      }

      // Move forward by CHUNK_SIZE - CHUNK_OVERLAP for overlap
      startChar += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    this.logger.debug(
      `Created ${chunks.length} chunks for document: ${documentId}`,
    );

    return chunks;
  }

  /**
   * Stage 3: Generate embeddings for each chunk.
   *
   * CURRENT STATE: Returns null embeddings (placeholder).
   * PHASE 3 IMPLEMENTATION: Will call the AI provider abstraction
   * in `packages/ai` which supports OpenAI, Anthropic, and Gemini.
   *
   * WHY BATCH?
   * Embedding APIs have rate limits. We batch chunks (e.g., 100 at a time)
   * with a small delay between batches to avoid hitting rate limits.
   */
  async generateEmbeddings(
    chunks: TextChunk[],
    documentId: string,
  ): Promise<ChunkWithEmbedding[]> {
    this.logger.debug(
      `Generating embeddings for ${chunks.length} chunks (document: ${documentId})`,
    );

    // TODO Phase 3: Implement actual embedding generation
    // const batchSize = 100;
    // for (const batch of chunkArray(chunks, batchSize)) {
    //   const embeddings = await this.aiProvider.embed(batch.map(c => c.content));
    //   ...
    // }

    // Placeholder: return chunks with null embeddings
    return chunks.map((chunk) => ({
      ...chunk,
      embedding: null, // Will be a float[] of length EMBEDDING_DIMENSIONS in Phase 3
    }));
  }

  /**
   * Stage 4: Persist chunks (with optional embeddings) to PostgreSQL.
   *
   * CURRENT STATE: Logs without writing to DB (no DB connection in worker yet).
   * PHASE 3 IMPLEMENTATION: Will use Prisma to bulk-insert DocumentChunk records,
   * including the pgvector embedding column.
   */
  async storeChunks(
    chunks: ChunkWithEmbedding[],
    documentId: string,
    organizationId: string,
  ): Promise<void> {
    this.logger.log(
      `[PLACEHOLDER] Would store ${chunks.length} chunks for document: ${documentId} (org: ${organizationId})`,
    );

    // TODO Phase 3: Bulk-insert chunks via Prisma
    // await this.db.documentChunk.createMany({
    //   data: chunks.map((chunk) => ({
    //     documentId,
    //     organizationId,
    //     content: chunk.content,
    //     chunkIndex: chunk.chunkIndex,
    //     tokenCount: chunk.tokenCount,
    //     startChar: chunk.startChar,
    //     endChar: chunk.endChar,
    //     embedding: chunk.embedding
    //       ? { set: chunk.embedding }
    //       : undefined,
    //   })),
    // });
    //
    // await this.db.document.update({
    //   where: { id: documentId },
    //   data: { status: 'READY', processedAt: new Date() },
    // });
  }

  /**
   * Mark a document as FAILED in the database when processing errors occur.
   *
   * CURRENT STATE: Logs without writing to DB.
   * PHASE 3 IMPLEMENTATION: Updates document status via Prisma.
   */
  async markDocumentFailed(
    documentId: string,
    errorMessage: string,
  ): Promise<void> {
    this.logger.warn(
      `[PLACEHOLDER] Would mark document ${documentId} as FAILED: ${errorMessage}`,
    );

    // TODO Phase 3:
    // await this.db.document.update({
    //   where: { id: documentId },
    //   data: { status: 'FAILED', processingError: errorMessage },
    // });
  }
}
