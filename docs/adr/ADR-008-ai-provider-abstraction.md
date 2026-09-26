# ADR-008: AI Provider Abstraction

**Status:** Accepted  
**Date:** 2026-09-26

---

## Decision

Build a **provider-agnostic AI abstraction layer** in `packages/ai` instead of calling OpenAI directly from business logic.

---

## Interface Design

```typescript
// packages/ai/src/types.ts

export interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface LanguageModelOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
}

export interface LanguageModelProvider {
  complete(
    messages: LanguageModelMessage[],
    options: LanguageModelOptions
  ): Promise<LanguageModelResponse>;

  stream(
    messages: LanguageModelMessage[],
    options: LanguageModelOptions
  ): AsyncIterable<LanguageModelStreamChunk>;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}
```

---

## Implementations

```
packages/ai/src/providers/
├── openai.provider.ts      ← OpenAI GPT-4o, text-embedding-3-small
├── anthropic.provider.ts   ← Claude 3.5 Sonnet
├── google.provider.ts      ← Gemini 2.0 Flash
└── openrouter.provider.ts  ← Routes to any model
```

---

## Why This Matters

1. **Vendor lock-in**: OpenAI's API goes down, pricing increases, or you find a better model → swap with one config change
2. **Cost optimization**: Route cheap tasks (classification) to smaller models, expensive tasks (summarization) to larger ones
3. **Evaluation**: Run the same prompts through multiple providers, compare quality
4. **Privacy**: Route sensitive data to private deployments (Ollama, AWS Bedrock) instead of third parties
5. **Testing**: Mock the interface in tests — no API calls during unit tests

---

## Model Routing Strategy

```typescript
// Different tasks → different models
const AI_ROUTES = {
  summarization: { provider: 'openai', model: 'gpt-4o-mini' },
  qa: { provider: 'openai', model: 'gpt-4o' },
  agent: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
};
```

---

## Consequences

- Business logic (`AIModule`, `AgentModule`) only imports from `packages/ai`
- Provider selection is config-driven (environment variables)
- New provider = new implementation file + register in factory
- AI calls are always traced and logged (cost tracking)
