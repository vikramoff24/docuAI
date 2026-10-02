/**
 * Message types for AI provider communication.
 *
 * These map to the standard OpenAI/Anthropic message format.
 * By defining our own types, we avoid depending on any specific SDK's
 * type definitions in the interface layer.
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  /** Tool call metadata (for tool-use messages) */
  toolCallId?: string;
  toolName?: string;
  /** Tool calls made by the assistant */
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface CompletionOptions {
  /** Model identifier (overrides provider default) */
  model?: string;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature 0-2 (0 = deterministic, 2 = very creative) */
  temperature?: number;
  /** Top-p sampling (alternative to temperature) */
  topP?: number;
  /** Stop sequences */
  stop?: string[];
  /** System prompt (prepended to messages if provided) */
  systemPrompt?: string;
  /** Tools available for the AI to call */
  tools?: ToolDefinition[];
}

export interface CompletionResult {
  /** Generated text content */
  content: string;
  /** Reason completion stopped: 'stop', 'length', 'tool_calls', 'content_filter' */
  finishReason: string;
  /** Token usage statistics */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Model used (may differ from requested if fallback) */
  model: string;
  /** Tool calls if the model chose to call tools */
  toolCalls?: ToolCall[];
}

export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Number of tokens in the input */
  tokenCount: number;
  /** Model used for embedding */
  model: string;
}

export interface StreamChunk {
  /** Incremental text content */
  content: string;
  /** True if this is the final chunk */
  done: boolean;
  /** Finish reason (only present on final chunk) */
  finishReason?: string;
}
