/**
 * AIProvider — Provider-agnostic interface for AI operations.
 *
 * WHY AN INTERFACE?
 * ─────────────────
 * We want to switch between OpenAI, Anthropic, Gemini, and local models
 * without changing application code. The interface defines the contract;
 * providers implement it.
 *
 * This is the Adapter pattern — each AI SDK is a different external system
 * with different APIs, but our code only sees the unified AIProvider interface.
 *
 * USAGE:
 * ──────
 * The AIModule in NestJS injects the correct provider based on AI_PROVIDER env var.
 * All consumers (RAGService, SummarizationService) depend only on this interface.
 *
 * STREAMING:
 * ──────────
 * The stream() method returns an AsyncGenerator that yields StreamChunks.
 * The controller converts this to Server-Sent Events (SSE).
 *
 * EMBEDDINGS:
 * ───────────
 * Embeddings must be consistent: once we store 1536-dim vectors, all future
 * queries must also use 1536-dim embeddings. Changing models requires re-indexing.
 */

import {
  Message,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  StreamChunk,
} from './message.types';

export interface AIProvider {
  /** Provider name for logging and error messages */
  readonly name: string;

  /** Default model for completions */
  readonly defaultModel: string;

  /** Default model for embeddings */
  readonly embeddingModel: string;

  /**
   * Generate a completion (non-streaming).
   * Use for: summarization, classification, short Q&A.
   */
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;

  /**
   * Generate a streaming completion.
   * Use for: interactive chat, long-form generation.
   *
   * Yields StreamChunks as tokens are generated.
   * The final chunk has done=true.
   *
   * @example
   * for await (const chunk of provider.stream(messages)) {
   *   if (chunk.done) break;
   *   sendSSE(chunk.content);
   * }
   */
  stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<StreamChunk>;

  /**
   * Generate embeddings for a batch of texts.
   * Embeddings are used for semantic search (pgvector).
   *
   * @param texts - Array of text strings to embed
   * @returns Array of embedding results (same order as input)
   */
  embed(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Check provider availability (API key set, endpoint reachable).
   * Returns true if provider can handle requests.
   */
  isAvailable(): boolean;
}
