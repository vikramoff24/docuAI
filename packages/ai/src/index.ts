/**
 * @docuflow/ai — Public API
 *
 * This package provides a unified AI provider abstraction for DocuFlow.
 *
 * USAGE:
 * ──────
 * In apps that need AI (API, Worker):
 *   import { OpenAIProvider, AIProvider, Message } from '@docuflow/ai';
 *
 * In NestJS modules:
 *   const provider = new OpenAIProvider(process.env.OPENAI_API_KEY);
 *
 * DESIGN PRINCIPLES:
 * ─────────────────
 * 1. This package has no NestJS dependency (pure TypeScript)
 * 2. Providers are plain classes (no decorators)
 * 3. NestJS modules instantiate and inject providers
 * 4. Easy to test — no DI container needed
 */

// Types
export type { AIProvider } from './types/ai-provider.interface';
export type {
  Message,
  MessageRole,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  StreamChunk,
} from './types/message.types';

// Providers
export { OpenAIProvider } from './providers/openai.provider';
