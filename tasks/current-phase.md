# Phase 4 → Phase 5 Current Tasks

## Current Phase: Phase 4 (COMPLETE ✅) → Phase 5 (starting)

---

## Phase 4 — COMPLETE ✅

| Task | Status | Notes |
|---|---|---|
| Migration: pgvector HNSW index on `document_chunks.embedding` | ✅ DONE | HNSW m=16 ef_construction=64 |
| Migration: tsvector GIN index on `documents.searchVector` | ✅ DONE | Auto-updated by trigger |
| Migration: GIN index on `documents.tags[]` | ✅ DONE | Enables @> queries |
| Migration: pg_trgm GIN index on `documents.name` | ✅ DONE | Fast ILIKE queries |
| Trigger: auto-update searchVector on INSERT/UPDATE | ✅ DONE | Weighted: name(A) desc(B) tags(C) |
| `SearchModule` — fulltext + semantic + hybrid | ✅ DONE | RRF k=60 fusion |
| `GET /search` with all filters | ✅ DONE | folderId, mimeType, tags, limit, offset |
| `GET /search/suggest` typeahead | ✅ DONE | pg_trgm ILIKE, max 8 results |
| Worker: storeChunks stores embeddings via raw SQL | ✅ DONE | Graceful degradation if no API key |
| Search integration tests (21 tests) | ✅ DONE | 63 total: 100% pass rate |

---

## Phase 5 Tasks — AI Summaries + Q&A (RAG)

### 5.1 packages/ai — Provider Abstraction

```
packages/ai/
  src/
    types/
      ai-provider.interface.ts  ← AIProvider interface
      message.types.ts          ← Message, Role, CompletionOptions types
    providers/
      openai.provider.ts        ← OpenAI implementation
      anthropic.provider.ts     ← Anthropic implementation (optional)
    ai.module.ts                ← NestJS module (factory pattern)
    index.ts                    ← public exports
  package.json
  tsconfig.json
```

**AIProvider interface methods:**
- `complete(messages, options)` → completion response
- `stream(messages, options)` → AsyncIterable<string> for SSE streaming
- `embed(texts)` → number[][] embeddings

### 5.2 RAGService

```
apps/api/src/ai/
  rag.service.ts        ← retrieval + generation
  ai.module.ts          ← NestJS module
```

**RAGService methods:**
- `retrieveContext(query, orgId, opts)`:
  - Embed query via AI provider
  - pgvector cosine search for top-k chunks (reuse SearchService)
  - Return chunks with document references
- `generateAnswer(question, chunks, conversationHistory)`:
  - Build prompt with context window management
  - Call AI provider for completion
  - Return answer + source citations

### 5.3 ConversationsModule

```
apps/api/src/conversations/
  conversations.controller.ts
  conversations.service.ts
  conversations.module.ts
  messages/
    messages.controller.ts
    messages.service.ts
  dto/
    create-conversation.dto.ts
    send-message.dto.ts
```

**Endpoints:**
- `POST /conversations` — create conversation
- `GET /conversations` — list user conversations (paginated)
- `GET /conversations/:id` — get conversation with messages
- `DELETE /conversations/:id` — delete conversation
- `POST /conversations/:id/messages` — send message + get AI response (SSE stream)
  - Body: `{ content: string, documentIds?: string[] }`
  - Response: SSE stream of `{ type: 'chunk'|'done'|'error', content, citations }`

### 5.4 Document Summarization

**Endpoint:**
- `POST /documents/:id/summarize` — generate summary
  - Response: `{ summary: string, keyPoints: string[], wordCount: number }`
  - Cache in `documents.metadata.summary` to avoid re-generation

---

## Architecture Context

### RAG Flow
```
User: POST /conversations/:id/messages { content: "What are the payment terms?" }

1. MessagesService.sendMessage():
   a. Save user message to DB
   b. Call RAGService.retrieveContext(content, orgId, { limit: 5 })
      → embed query (OpenAI text-embedding-3-small)
      → pgvector search: SELECT chunks ORDER BY embedding <=> query_vec LIMIT 5
      → return top-5 chunks with document metadata
   c. Call RAGService.generateAnswer(question, chunks, history)
      → Build system prompt:
         "You are a document assistant. Answer using only the provided context.
          Context: [chunk1] [chunk2] ... 
          Cite sources as [Doc: Name, Chunk N]."
      → Stream completion via OpenAI/Anthropic
   d. Save assistant message to DB (with citations in metadata)
   e. SSE: stream response chunks to client

Client receives:
  data: {"type":"chunk","content":"The payment terms are "}
  data: {"type":"chunk","content":"Net 30 days from invoice date,"}
  data: {"type":"citations","citations":[{"documentId":"...","chunkIndex":2,"documentName":"..."}]}
  data: {"type":"done"}
```

### Context Window Management
- Max context: 8000 tokens (safe for GPT-4o-mini 128k context)
- Each chunk: ~250 tokens (1000 chars / 4 chars/token)
- Max chunks: 5 → ~1250 tokens context
- System prompt: ~200 tokens
- Conversation history: last 6 turns × ~200 tokens = ~1200 tokens
- Available for answer: ~6300 tokens

---

## Files to Create Next

```
packages/ai/package.json
packages/ai/tsconfig.json
packages/ai/src/types/ai-provider.interface.ts
packages/ai/src/types/message.types.ts
packages/ai/src/providers/openai.provider.ts
packages/ai/src/index.ts
apps/api/src/ai/rag.service.ts
apps/api/src/ai/ai.module.ts
apps/api/src/conversations/conversations.controller.ts
apps/api/src/conversations/conversations.service.ts
apps/api/src/conversations/conversations.module.ts
apps/api/src/conversations/dto/create-conversation.dto.ts
apps/api/src/conversations/dto/send-message.dto.ts
apps/api/test/conversations.integration.ts
```
