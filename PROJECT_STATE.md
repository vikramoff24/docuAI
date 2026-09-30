# DocuFlow AI — Project State

> **This file is the single source of truth for every development session.**
> Read this first. Always. Before touching any code.

---

## Current Phase

**Phase 0 — Foundation & Architecture Setup** ✅ COMPLETE  
**Phase 1 — Auth & Organizations** ✅ COMPLETE  
**Phase 2 — Documents** ✅ COMPLETE  
**Phase 3 — Document Processing Pipeline** ✅ COMPLETE  
**Phase 4 — Search** ✅ COMPLETE  
**Phase 5 — AI (RAG)** 🔜 NEXT

---

## Current Objective

Phase 4 (Search) is complete. All 63 integration tests passing.
Next: Phase 5 — AI Summaries + Q&A (RAG) with `packages/ai` provider abstraction.

---

## Current Task Status

### Phase 0 (COMPLETE ✅)
- [x] Inspect repository
- [x] Initialize git
- [x] Create monorepo with pnpm workspaces
- [x] Configure TypeScript, ESLint, Prettier
- [x] Create Docker Compose configuration (Postgres 16 + pgvector, Redis 7, LocalStack S3, Adminer)
- [x] Create Prisma schema with complete multi-tenant data model (11 models)
- [x] Bootstrap NestJS API app with Auth, Users, Organizations, and Database modules
- [x] Implement Auth module (registration, login, JWT + Local strategies, guards, bcrypt hashing)
- [x] Implement AuthService unit test suite (6/6 tests passing)
- [x] Fix `passport-local` package in `apps/api`
- [x] Fix tsconfig.json in `packages/database` and `apps/worker` (inlined options)
- [x] Start Docker infrastructure (`docker compose up -d` — all 3 containers healthy)
- [x] Run initial Prisma database migration (`20260927182727_init`)
- [x] Seed database with test users and organizations
- [x] Bootstrap Next.js 16 Web app (`apps/web`) — stunning dark landing page
- [x] Bootstrap BullMQ Worker app (`apps/worker`) — document processing pipeline scaffold
- [x] Verify `GET /api/v1/health` returns `{ status: 'ok', services: { database: 'ok' } }`
- [x] Full monorepo typecheck passes (5 packages clean)
- [x] All tests pass (6 API unit tests + worker passWithNoTests)

### Phase 1 (COMPLETE ✅)
- [x] Auth module (register, login, JWT + Local strategies) — written and tested
- [x] Auth integration tests (register, login, refresh, logout, cross-tenant isolation) — 17 tests
- [x] Refresh token rotation (`POST /auth/refresh`) — implemented and tested
- [x] Token revocation via Redis blacklist (`POST /auth/logout`) — implemented
  - Uses `jti` (JWT ID UUID claim) as the Redis blacklist key
  - JwtAuthGuard checks `blacklist:<jti>` on every authenticated request
  - Auto-expires from Redis at token TTL
- [x] `RedisModule` — global, `@Global()`, exports `REDIS_CLIENT` (ioredis)
- [x] `JwtAuthGuard` — enhanced with Redis blacklist check (manual base64url decode)
- [x] Organization invitation API (create/list/cancel/accept)
- [x] All 17 auth integration tests passing

### Phase 2 (COMPLETE ✅)
- [x] `DocumentsModule` — 2-phase upload flow (presigned S3 PUT URL → confirm)
- [x] `StorageService` — S3-compatible (LocalStack dev / AWS prod), presigned URLs
- [x] `FoldersModule` — create/list/delete folder tree with materialized paths
- [x] AWS SDK installed (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- [x] Schema: sizeBytes BigInt → Int migration (`20260930143849_change_sizebytes_to_int`)
- [x] BullMQ wired in `confirmUpload` — queues `process-document` job
- [x] 19 document integration tests passing (42 total: 100% pass rate)

### Phase 3 (COMPLETE ✅)
- [x] `WorkerDatabaseModule` — @Global() Prisma provider for worker
- [x] `WorkerDatabaseService` — Prisma client with own connection pool
- [x] `DocumentProcessingService` — full pipeline:
  - `extractText()`: S3 download + pdf-parse (PDF) + mammoth (DOCX) + UTF-8 (text)
  - `chunkText()`: 1000-char overlapping chunks (200-char overlap)
  - `generateEmbeddings()`: OpenAI text-embedding-3-small (skipped if no API key)
  - `storeChunks()`: Prisma createMany chunks + raw SQL UPDATE for embeddings
  - `markDocumentFailed()`: sets doc status → FAILED
- [x] `DocumentProcessingConsumer` — BullMQ processor with queue lifecycle hooks
- [x] Dependencies: pdf-parse, mammoth, @aws-sdk/client-s3 added to worker

### Phase 4 (COMPLETE ✅)
- [x] Migration `20260930150932_add_search_and_embeddings`:
  - `embedding vector(1536)` column on `document_chunks` (HNSW index)
  - `searchVector tsvector` column on `documents` (GIN index)
  - GIN index on `tags[]` array
  - pg_trgm GIN index on `name` for ILIKE
  - PostgreSQL trigger: auto-updates `searchVector` on INSERT/UPDATE
- [x] `SearchModule` — `SearchController` + `SearchService` + `SearchQueryDto`
  - `GET /search?q=...&mode=fulltext|semantic|hybrid` — document search
  - `GET /search/suggest?q=...` — typeahead suggestions (max 8)
  - Fulltext: tsvector `@@` operator with `ts_rank_cd()` ranking
  - Semantic: pgvector cosine similarity via HNSW index (degrades to fulltext w/o API key)
  - Hybrid: Reciprocal Rank Fusion (k=60) combining fulltext + semantic
  - Filters: folderId, mimeType, tags (AND logic), limit, offset
- [x] Worker `storeChunks()` updated: Prisma createMany + raw SQL UPDATE for embedding vectors
- [x] 21 search integration tests passing (63 total: 100% pass rate)

---

## Overall Progress

```
Phase 0: Foundation          ████████████████████  100% ✅
Phase 1: Auth + Orgs         ████████████████████  100% ✅
Phase 2: Documents           ████████████████████  100% ✅
Phase 3: Document Pipeline   ████████████████████  100% ✅
Phase 4: Search              ████████████████████  100% ✅
Phase 5: AI (RAG)            ░░░░░░░░░░░░░░░░░░░░    0% 🔜 NEXT
Phase 6: AI Agent            ░░░░░░░░░░░░░░░░░░░░    0%
Phase 7: CI/CD + Deploy      ░░░░░░░░░░░░░░░░░░░░    0%
Phase 8: Observability       ░░░░░░░░░░░░░░░░░░░░    0%
Phase 9: Polish + Eval       ░░░░░░░░░░░░░░░░░░░░    0%
```

---

## Completed Features

- [x] Git repository initialized
- [x] Monorepo structure with pnpm workspaces
- [x] Shared tooling packages: `@docuflow/config`
- [x] Architecture documentation (docs/architecture.md, ADR-001 through ADR-009)
- [x] Complete Prisma schema with 11 models
- [x] Database seed script (5 users, 2 orgs)
- [x] Local infrastructure (PostgreSQL + pgvector, Redis, LocalStack, Adminer)
- [x] Migrations: init, change_sizebytes_to_int, add_search_and_embeddings
- [x] NestJS API (`apps/api` — port 3001):
  - `DatabaseModule`, `RedisModule` (global)
  - `AuthModule` with JWT + Redis blacklist + RBAC
  - `UsersModule`, `OrganizationsModule`, `InvitationsModule`
  - `DocumentsModule` — S3 upload flow, CRUD, presigned URLs, BullMQ queue
  - `FoldersModule` — folder tree with materialized paths
  - `SearchModule` — fulltext + semantic + hybrid + typeahead
  - Global filters, interceptors, validators
- [x] Next.js 16 Web app (`apps/web` — port 3000) — dark landing page
- [x] BullMQ Worker app (`apps/worker` — port 3002):
  - Full document processing pipeline: extract → chunk → embed → store
  - pgvector embedding storage via raw SQL
  - WorkerDatabaseModule with own Prisma connection pool

---

## In Progress / Next Session

### Phase 5 — AI Summaries + Q&A (RAG)

1. **`packages/ai` — Provider Abstraction**:
   - Interface: `AIProvider` with `complete()`, `streamComplete()`, `embed()`
   - Implementations: `OpenAIProvider`, `AnthropicProvider`
   - Config: provider selection via `AI_PROVIDER` env var
   - `packages/ai/src/index.ts` exports

2. **`AIModule` in API**:
   - `ConversationsController` — CRUD for conversations
   - `MessagesController` — POST /conversations/:id/messages (with streaming SSE)
   - `RAGService` — retrieval + generation:
     - `retrieveContext()`: embed query → vector search → top-k chunks
     - `generateAnswer()`: assemble context + prompt → LLM completion
     - Citation tracking: source chunk IDs in response metadata

3. **Document Summarization**:
   - `POST /documents/:id/summarize` — generate summary + key points
   - Store summary in `metadata` field or new `DocumentSummary` model
   - Streaming response via SSE

4. **`ConversationsModule`**:
   - `POST /conversations` — create conversation (optionally tied to a document)
   - `GET /conversations` — list user's conversations
   - `GET /conversations/:id` — conversation with messages
   - `POST /conversations/:id/messages` — send message, get AI response (SSE stream)
   - Store messages in `messages` table

---

## Remaining Work

See `tasks/roadmap.md` for all phases.

---

## Current Architecture

```
DocuFlow AI — Modular Monolith
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
apps/
  web/        → Next.js 16, TypeScript, Tailwind v4 (✅ running port 3000)
  api/        → NestJS, TypeScript, Prisma, Passport, Fastify (✅ running port 3001)
  worker/     → NestJS (lightweight), BullMQ workers (✅ bootstrapped port 3002)

packages/
  database/   → Prisma schema (11 models), seed, migrations (✅ migrated & seeded)
  ai/         → AI provider abstraction (OpenAI/Anthropic/Gemini) (🔜 Phase 5)
  config/     → Shared ESLint, TypeScript, prettier configs (✅ created)

Infrastructure (local dev — ALL RUNNING ✅):
  PostgreSQL 16 + pgvector  (port 5432) — with vector + pg_trgm extensions
  Redis 7                   (port 6379)
  LocalStack (S3-compatible) (port 4566) — bucket 'docuflow-dev' created
  Adminer (DB Web GUI)       (port 8080)
```

---

## Important Decisions

| Decision | Choice | ADR |
|---|---|---|
| Repo structure | Monorepo (pnpm workspaces) | ADR-001 |
| Backend architecture | Modular Monolith (NestJS) | ADR-002 |
| Database | PostgreSQL 16 + Prisma | ADR-003 |
| Auth strategy | JWT (access) + refresh tokens | ADR-004 |
| Object storage | S3-compatible (LocalStack dev, AWS prod) | ADR-005 |
| Background jobs | BullMQ + Redis | ADR-006 |
| Vector search | pgvector (PostgreSQL extension) | ADR-007 |
| AI abstraction | Provider-agnostic interface | ADR-008 |
| Multi-tenancy | Application-level (org_id FK on all tenant resources) | ADR-009 |

---

## Recent Changes

- 2026-09-30: Phase 4 Search complete.
  - Migration: `20260930150932_add_search_and_embeddings` (pgvector HNSW, tsvector, GIN indexes, trigger)
  - `SearchModule`: fulltext (tsvector ts_rank_cd), semantic (pgvector cosine), hybrid (RRF k=60)
  - `GET /search` with filters: folderId, mimeType, tags, limit, offset
  - `GET /search/suggest` typeahead (pg_trgm ILIKE, max 8 results)
  - Worker `storeChunks()` updated to write embedding vectors via raw SQL
  - 21 search integration tests, 63 total (100% pass rate)

- 2026-09-30: Phase 3 Document Processing Pipeline complete.
  - WorkerDatabaseModule, DocumentProcessingService (extract+chunk+embed+store)
  - BullMQ job queue wired in DocumentsService.confirmUpload()

- 2026-09-30: Phase 1 + Phase 2 complete.
  - Redis blacklist, InvitationsModule, DocumentsModule, FoldersModule
  - 42 integration tests passing

---

## Known Issues & Errors

None currently.

---

## Technical Debt

1. **tsconfig extends**: `packages/config/tsconfig.base.json` not used by apps — each inlines options. Standard NestJS monorepo pattern — low priority.
2. **Semantic search graceful degradation**: If OPENAI_API_KEY not set, semantic/hybrid falls back to fulltext. This is intentional but should be documented in API responses.
3. **Embedding update perf**: Worker updates embeddings one-by-one via raw SQL. For large documents (100+ chunks), this could be slow. Future: batch UNNEST update.
4. **Refresh token lookup**: Linear bcrypt scan — works for Phase 1 scale, optimize later.

---

## Environment Status

| Service | Status | Notes |
|---|---|---|
| Node.js | ✅ v24.18.0 via NVM | Located in `~/.nvm/versions/node/v24.18.0/bin` |
| pnpm | ✅ v9.x via NVM | Located in `~/.nvm/versions/node/v24.18.0/bin` |
| Docker | ✅ Running | Docker Desktop, binary at `~/.docker/bin/docker` |
| PostgreSQL | ✅ Running | Container: `docuflow-postgres`, port 5432 |
| Redis | ✅ Running | Container: `docuflow-redis`, port 6379 |
| LocalStack | ✅ Running | Container: `docuflow-localstack`, port 4566 |
| API Server | ❓ Not checked this session | Port 3001 (dev mode) |
| Web Server | ❓ Not checked this session | Port 3000 (Next.js dev) |

---

## Test Status

- `apps/api` unit: ✅ 6/6 passing (`src/auth/auth.service.spec.ts`)
- `apps/api` integration: ✅ 63/63 passing (auth: 17, documents: 19, search: 21... +misc: 6)
  - `test/auth.integration.ts` — 17 tests ✅
  - `test/documents.integration.ts` — 19 tests ✅
  - `test/search.integration.ts` — 21 tests ✅
- `apps/worker`: No tests yet (passWithNoTests configured)
- E2E: Not yet run

---

## Database Migration Status

- ✅ `20260927182727_init` — Full initial schema (11 tables)
- ✅ `20260930143849_change_sizebytes_to_int` — sizeBytes BIGINT → INT
- ✅ `20260930150932_add_search_and_embeddings` — pgvector, tsvector, GIN indexes, trigger

---

## Current Git Branch & Commit

- Branch: `main`
- Previous checkpoint: `5a28443` (Phase 3 worker pipeline)
- **Upcoming commit this session**: Phase 4 Search complete

---

## Exact Next Actions for Next Session

### FIRST: Phase 5 — packages/ai provider abstraction

```bash
# Create the packages/ai package
mkdir -p packages/ai/src/{providers,types}

# Install AI SDK dependencies
pnpm --filter @docuflow/ai add openai @anthropic-ai/sdk
```

Then implement:
1. `packages/ai/src/types/ai-provider.interface.ts` — provider abstraction
2. `packages/ai/src/providers/openai.provider.ts` — OpenAI implementation
3. `packages/ai/src/providers/anthropic.provider.ts` — Anthropic implementation
4. `packages/ai/src/ai.module.ts` — NestJS module for AI providers
5. `packages/ai/src/index.ts` — public exports

### THEN: ConversationsModule in API

- `apps/api/src/conversations/` — full CRUD
- `POST /conversations/:id/messages` — RAG-powered Q&A with SSE streaming
- Context retrieval: embed query → vector search → top-k chunks → LLM

### THEN: Document Summarization

- `POST /documents/:id/summarize` → generate + cache summary

## Test Accounts (seeded)

| Email | Password | Role | Org |
|---|---|---|---|
| alice@acme.com | Password123! | OWNER | Acme Corp |
| bob@acme.com | Password123! | ADMIN | Acme Corp |
| carol@acme.com | Password123! | MEMBER | Acme Corp |
| dave@acme.com | Password123! | VIEWER | Acme Corp |
| eve@beta.com | Password123! | OWNER | Beta Inc |
