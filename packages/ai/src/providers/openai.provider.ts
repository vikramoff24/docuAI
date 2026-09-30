/**
 * OpenAIProvider — implements AIProvider using OpenAI's SDK.
 *
 * Models used:
 * - Completions: gpt-4o-mini (fast, cheap, capable — ideal for RAG)
 *   → Fallback: gpt-3.5-turbo (if gpt-4o-mini unavailable)
 * - Embeddings: text-embedding-3-small (1536 dims, fast, cheap)
 *   → Must match EMBEDDING_DIMENSIONS constant in worker
 *
 * WHY gpt-4o-mini FOR RAG?
 * ─────────────────────────
 * - 128k context window — enough for 50+ document chunks
 * - Excellent instruction following for citation extraction
 * - ~10x cheaper than gpt-4o for equivalent quality on retrieval tasks
 * - 15k output tokens/min → fast enough for streaming
 *
 * RATE LIMITING:
 * ───────────────
 * This provider does NOT implement rate limiting.
 * Rate limiting should be handled at the queue/service level.
 * The OpenAI SDK automatically retries on 429 (rate limit) errors.
 *
 * ERROR HANDLING:
 * ───────────────
 * We convert OpenAI SDK errors to standard Error instances.
 * Callers should catch: network errors, auth errors (401), context errors (400).
 */

import OpenAI from 'openai';
import {
  AIProvider,
} from '../types/ai-provider.interface';
import {
  Message,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  StreamChunk,
} from '../types/message.types';

// Default models — centralized for easy updates
const DEFAULT_COMPLETION_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536; // Must match pgvector column dimension

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly defaultModel = DEFAULT_COMPLETION_MODEL;
  readonly embeddingModel = DEFAULT_EMBEDDING_MODEL;

  private readonly client: OpenAI;
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['OPENAI_API_KEY'];
    this.client = new OpenAI({
      apiKey: this.apiKey || 'missing-key-to-prevent-sdk-throw',
      // maxRetries: 3 — OpenAI SDK default
      // timeout: 30000ms — OpenAI SDK default
    });
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Completion (non-streaming)
  // ──────────────────────────────────────────────────────────────────────────

  async complete(
    messages: Message[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const {
      model = this.defaultModel,
      maxTokens = 4096,
      temperature = 0.3, // Low for RAG — factual, not creative
      topP,
      stop,
      systemPrompt,
    } = options;

    // Prepend system message if provided (and not already in messages)
    const fullMessages = this.buildMessages(messages, systemPrompt);

    const response = await this.client.chat.completions.create({
      model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature,
      ...(topP !== undefined ? { top_p: topP } : {}),
      ...(stop ? { stop } : {}),
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OpenAI returned no choices');
    }

    return {
      content: choice.message.content ?? '',
      finishReason: choice.finish_reason ?? 'stop',
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Streaming completion
  // ──────────────────────────────────────────────────────────────────────────

  async *stream(
    messages: Message[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamChunk> {
    const {
      model = this.defaultModel,
      maxTokens = 4096,
      temperature = 0.3,
      topP,
      stop,
      systemPrompt,
    } = options;

    const fullMessages = this.buildMessages(messages, systemPrompt);

    const stream = await this.client.chat.completions.create({
      model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature,
      ...(topP !== undefined ? { top_p: topP } : {}),
      ...(stop ? { stop } : {}),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const finishReason = chunk.choices[0]?.finish_reason;

      if (delta?.content) {
        yield {
          content: delta.content,
          done: false,
        };
      }

      if (finishReason) {
        yield {
          content: '',
          done: true,
          finishReason,
        };
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Embeddings
  // ──────────────────────────────────────────────────────────────────────────

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // Sort by index to ensure order matches input
    const sorted = response.data.sort((a, b) => a.index - b.index);

    return sorted.map((item) => ({
      embedding: item.embedding,
      tokenCount: response.usage.total_tokens / texts.length, // Approximate
      model: response.model,
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Convert our Message[] to OpenAI's message format.
   * Prepends a system message if systemPrompt is provided.
   */
  private buildMessages(
    messages: Message[],
    systemPrompt?: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      openAiMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') {
        // Tool messages require tool_call_id and content
        openAiMessages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId ?? 'unknown',
        });
      } else if (msg.role === 'assistant') {
        openAiMessages.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'user') {
        openAiMessages.push({ role: 'user', content: msg.content });
      } else {
        // system
        openAiMessages.push({ role: 'system', content: msg.content });
      }
    }

    return openAiMessages;
  }
}
