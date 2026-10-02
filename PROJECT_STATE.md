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
**Phase 5 — AI (RAG)** ✅ COMPLETE
**Phase 6 — AI Agent** ✅ CORE COMPLETE (extra tools deferred)

---

## Current Objective

Phase 6 core is complete end-to-end (DB → API → worker → UI → unit/integration/E2E → CI config → docs).
Next: commit the Phase 6 checkpoint and push to a GitHub remote so CI runs. Then choose between the Phase 6 extras
(approval-gated tools) and Phase 7 (observability). See `tasks/current-phase.md`.

**Development mode (from 2026-10-01):** features ship end-to-end. Frontend, backend, tests and docs move together,
and a feature is only DONE after browser verification (Playwright journeys) and a security check.

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

### Phase 5 (COMPLETE ✅)
- [x] `@docuflow/ai` provider abstraction, RAG, summarization, conversations + SSE

### Phase 6 (CORE COMPLETE ✅ — 2026-10-01)
- [x] `Workflow` model + migration; search columns declared `Unsupported(...)` so Prisma stops dropping them
- [x] API `AgentModule`: `POST/GET /workflows`, `GET /workflows/:id` (MEMBER+ to create, audit on create)
- [x] Worker `agent_workflows` consumer: tool loop, 10 iterations, 60k token budget, creator role re-check at run time
- [x] Tools: `searchDocuments`, `readDocument` (untrusted-content fencing), `updateDocumentMetadata` (limits + audit, transactional)
- [x] `@docuflow/ai`: tool-calling support
- [x] Web: "AI Agent" dashboard tab (create, history, polling, result/error, viewer read-only)
- [x] Web journey fixes: 401 → refresh → retry; cross-tab session; uploads work; XSS-safe highlights
- [x] Tests: 18 agent integration tests, 4 refresh-token unit tests, 7 Playwright journeys
- [x] CI workflow + migration guard (`pnpm db:check-migrations`)
- [ ] Deferred: listFolders/createFolder/moveDocument/summarizeDocument/shareDocument/getAuditLogs (need approval design)

---

## Overall Progress

```
Phase 0: Foundation          ████████████████████  100% ✅
Phase 1: Auth + Orgs         ████████████████████  100% ✅
Phase 2: Documents           ████████████████████  100% ✅
Phase 3: Document Pipeline   ████████████████████  100% ✅
Phase 4: Search              ████████████████████  100% ✅
Phase 5: AI (RAG)            ████████████████████  100% ✅
Phase 6: AI Agent            ████████████████░░░░   80% ✅ core (extra tools deferred)
Phase 7: CI/CD + Deploy      ░░░░░░░░░░░░░░░░░░░░    0%
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

1. Commit the Phase 6 work plus the teams/folders increment (all uncommitted in the working tree).
2. Add a GitHub remote and push, then confirm `.github/workflows/ci.yml` goes green. It has never run on GitHub.
3. Enable rate limiting (see Known Issues), then: Phase 6 extras with human approval for destructive tools, **or** Phase 7 observability.

### To fix later (from the 2026-10-01 teams/folders review)

- [ ] **Rate limiting is off everywhere, including login.** `ThrottlerModule` is configured in `apps/api/src/app.module.ts`,
  but no `ThrottlerGuard` is registered. Add it (e.g. as `APP_GUARD`) with strict per-route limits on login, signup, refresh
  and `GET /invitations/preview`. Give the test suites their own limits so integration/E2E runs (many requests from one IP) don't get 429s.
- [ ] **Folders:** add renaming folders and moving whole folders. Only documents can be moved today.
- [ ] **Mobile dashboard layout:** at phone widths the sidebar squeezes the content on every tab.
- [ ] **Invitations by email:** add email delivery and email verification. Then invites can be sent instead of
  copied, and a "pending invites for you" inbox becomes safe (see ADR-012).
- [ ] **Rotate the OpenAI key** that was pasted into a chat session on 2026-10-01. Local test organizations still store it
  (encrypted); remove those rows or reset the dev DB afterwards.
- [ ] **Dev tooling:** the Next.js dev server (Turbopack) can get stuck in an internal-error loop after many hot reloads
  (pages stay on "Rendering…"). Restart `pnpm dev` if E2E suddenly times out on blank pages.

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
| Agent workflows | Async queue + bounded tool loop | ADR-010 |
| Org AI keys | Encrypted per-org keys set in UI, env fallback | ADR-011 |
| Teams | Org on refresh token; live membership check; invite links | ADR-012 |

---

## Recent Changes

- 2026-10-01: **Teams, organization switching, folders UI, reindexing (end-to-end)**. See ADR-012.
  - **Org switching:** the session's org is stored on the refresh token (migration `20261001173531`, generated with
    `--create-only`; Prisma's HNSW drop removed). `POST /auth/refresh { organizationId }` switches, refresh/login
    resume the last org, and `GET /auth/organizations` lists memberships. UI: sidebar org switcher, and all panels
    remount on switch.
  - **Live membership check:** every request reads the role from `organization_members`. Removal and role changes now
    apply immediately (the JWT role used to be trusted for 15 min). Users left with no org get a personal workspace
    on login instead of a 404 lock-out.
  - **Invitations:** shareable link (token returned to admins; there's no email service). Public
    `GET /invitations/preview`, `/invite` landing page, sign-up through a link joins the org directly (no personal org),
    sign-in round-trip via a safe `?next=`. Atomic, single-use claims. There's no "pending invites" inbox on purpose: emails aren't verified.
  - **Team tab:** members list, rank-based role changes and removal, invite form with copyable link, pending invitations
    (copy/cancel), leave organization. Owner removal/demotion locks owner rows (no ownerless org under concurrency).
  - **Folders UI:** breadcrumb navigation, create/delete-empty folders, upload into the current folder, "Move…" per
    document (`PATCH /documents/:id`), `?folderId=root`, `GET /folders/all`. The hidden "/" root folder is no longer listed.
  - **Reprocess/reindex:** Retry on FAILED documents (`POST /documents/:id/reprocess`). Settings → "Search index"
    reindexes documents uploaded before a key existed or holding old placeholder text (`/documents/index-status`,
    `/documents/reindex`).
  - Bug found by the new E2E: the org switcher reused a stale org list, so switching back to the previous org did nothing.
  - Test changes: `ai-settings` helper relied on the stale-JWT-role behaviour (now impossible) and was rewritten.
  - Tests: `test/team.integration.ts` (20), `e2e/team.spec.ts` (7), +1 live journey in `ai-live.spec.ts` (reindex).

- 2026-10-01: **Full journey re-verification with a live OpenAI key**. All suites run against a clean `pnpm dev` stack,
  plus a live probe of PDF/DOCX/600KB/unicode files, hostile queries, deleted docs in RAG, cross-org access and prompt injection.
  - **PDF ingestion was broken for every PDF.** The worker called `pdf-parse` v2 with the v1 API (`pdfParse is not a
    function`), caught the error and stored `[PDF extraction failed: x.pdf]` as the document text with status READY.
    PDFs looked fine because searches matched the filename in that placeholder, but chat said "no information".
    Now uses `PDFParse#getText()`.
  - Unreadable files (corrupt or encrypted PDF/DOCX, PDFs with no text layer) now fail immediately with a clear reason
    (`ExtractionError` → `job.discard()`), not after 3 retries or with placeholder content. The reason shows inline on
    the document row, not only as a hover tooltip.
  - Worker skips jobs for documents deleted after queueing. They used to retry against an FK violation until they failed,
    and soft-deleted docs still got embedded.
  - Summarize returns 404 for another org's or a missing doc before checking for an AI key (was 503), and 409 for
    PROCESSING/FAILED docs (FAILED docs used to get summarized from placeholder text).
  - Flaky E2E: the upload→search journey searched before the worker finished; it now waits for "✓ Ready".
  - Tests: first worker unit tests (`document-processing.spec.ts`, 7; jest needs `--experimental-vm-modules` for
    pdfjs), +1 API integration, +1 E2E (PDF indexed and searchable; corrupt PDF shows its reason).
  - Dev DB: PDFs uploaded before this fix hold placeholder text. Re-upload them (there's no reprocess endpoint yet).

- 2026-10-01: **Edge-case deep dive (FE + BE)**. Regression tests: `apps/api/test/edge-cases.integration.ts` (37) and
  `apps/web/e2e/edge-cases.spec.ts` (6).
  - Security: SQL injection in semantic search (`mimeType` was interpolated into `$queryRawUnsafe`). RAG retrieval and the
    worker's embedding update are now parameterized too. An ADMIN could invite an OWNER; invites can no longer grant a
    role above the inviter's. VIEWERs could upload, delete and create folders; writes now need MEMBER+, and ADMIN/OWNER
    can delete anyone's document. Chat stream errors no longer echo raw provider messages.
  - Correctness: emails are trimmed and lowercased; mixed-case signups used to create duplicate accounts and failed
    lowercase login (lookups are case-insensitive, so legacy rows still work). Malformed input that returned 500 now
    returns 4xx: refresh/accept bodies, non-UUID ids/query params, repeated `?q=`, plus a Prisma error mapping
    (P2002/P2023/P2025). Top-level folders couldn't be deleted, and soft-deleted items kept folders "non-empty". Folder
    names reject `/`, `\` and whitespace-only values. Fulltext search now matches document **body text**, not just
    name/description/tags. The real S3 object size is checked at confirm (0-byte or >100MB rejected) because a
    presigned PUT can't enforce it. Summarizing a deleted document returns 404. Chat 404/503 now return real HTTP
    statuses instead of a 200 SSE stream, and failed generations are no longer stored as empty answers.
  - Races: confirm-upload, workflow claim (worker) and refresh-token rotation are atomic (`updateMany … where status/revokedAt`).
    A workflow whose enqueue fails is marked FAILED instead of staying PENDING.
  - Worker: NUL bytes are stripped from extracted text (Postgres rejected them and failed the document). A document
    is marked FAILED only after the last retry, so it no longer flips Failed→Ready while retrying.
  - FE: chat errors used to vanish after one render and now persist as a message. Conversation switching is locked
    while streaming. Search shows errors. Documents beyond 50 were invisible: "Load more" fixed that, and `offset`
    (rejected with 422) became `page`. The count shows the true total. Upload/delete actions follow the user's role.
    MIME type comes from the extension (`.md` arrived as `""`). Empty, oversized and unsupported files are rejected
    before upload. Cross-tab token refresh is serialized with the Web Locks API (two tabs used to log each other out),
    and a network error during refresh no longer logs the user out.
  - Tooling: `pnpm test:integration` never exited because the ioredis client wasn't closed (CI would hang). Fixed with
    an `onApplicationShutdown` hook.

- 2026-10-01: **OpenAI API key from the UI** (ADR-011). Dashboard → Settings lets admins add, verify, replace or remove
  the organization's OpenAI key. It's stored AES-256-GCM encrypted (org id as AAD), never returned (last 4 only), audited,
  and used by chat, summaries, semantic search, embeddings and the agent (org key → server `OPENAI_API_KEY`).
  The Agent tab shows a banner linking to Settings when no key is configured.
  New: `organization_ai_credentials` table (migration `20261001100000`, generated with `--create-only`; the guard caught
  Prisma's HNSW drop), `AI_CREDENTIALS_ENCRYPTION_KEY` env var (API + worker must match; dev fallback built in).

- 2026-10-01: **Live OpenAI end-to-end verification** of every AI flow (UI + API), using a real org key.
  - All passed: key verify/store (encrypted, last4 only), upload → embeddings, semantic/hybrid search, summaries,
    RAG chat with citations, all 3 agent workflow types (categorization writes tags/metadata), key removal → 503.
  - **Bugs found and fixed:**
    - Chat: the user's first message vanished (load effect overwrote the optimistic message) and persisted user
      messages were labelled "AI" (`USER` vs `"user"`). Citations were streamed and stored but never shown; now rendered.
    - Documents list never refreshed, so uploads showed PROCESSING until a manual reload. It now polls while any doc is processing.
    - A failed S3 PUT left an orphaned PENDING document (that the agent would later "categorize"). It's now deleted, with a clear error.
    - Agent `searchDocuments` only matched name/description/tags, so "which docs mention a due date" found nothing.
      It now also matches chunk text.
    - Hybrid search showed "2% match" (RRF scores aren't percentages). The badge now shows only for semantic mode.
  - New: per-document **Summarize** button (summary + key points inline). Before this, the endpoint had no UI.
  - New: `apps/web/e2e/ai-live.spec.ts`, an opt-in live journey (`E2E_OPENAI_KEY=sk-... pnpm test:e2e ai-live`, ~20s, a few cents).
    Also a journey test for upload-failure cleanup.
  - Dev: `allowedDevOrigins: ["127.0.0.1"]` in next.config, and `http://127.0.0.1:3000` added to LocalStack S3 CORS.

- 2026-10-01: **Phase 6 AI Agent (end-to-end)**. See ADR-010.
  - Backend: workflows API, worker tool loop with safety controls, audit logging.
  - Frontend: AI Agent tab; auth context rebuilt on `useSyncExternalStore` (no hydration flash, cross-tab sync);
    API client refreshes expired access tokens once and retries (single-flight, because refresh tokens rotate).
  - **Bugs found through browser verification and fixed:**
    - Every browser upload failed: AWS SDK ≥3.729 bakes an empty-body CRC32 into presigned PUT URLs → S3 400.
      Fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'`. The integration test bypassed presigned URLs; it now uses them.
    - LocalStack init script wasn't idempotent, so CORS was never applied to a pre-existing bucket.
    - FE sent `Content-Type: application/json` with empty bodies → Fastify error → 500. **Logout always failed,
      so refresh tokens were never revoked.** Now FE sends the header only with a body, and the filter maps FST_* 4xx correctly.
    - Refresh lookup scanned ≤100 unordered tokens with bcrypt (valid tokens could be rejected, and it was slow).
      Tokens are now `<id>.<secret>`: lookup by id, one bcrypt compare. Existing sessions must log in again.
    - Search highlights were rendered with `dangerouslySetInnerHTML` (stored XSS through document names/descriptions),
      and the FE read `highlight` while the API returns `highlights[]`.
    - Worker `dist/` was missing `main.js`: `deleteOutDir` + an incremental tsbuildinfo outside `dist` made tsc skip
      emitting files. `tsBuildInfoFile` now lives in `dist/`, and `*.tsbuildinfo` is gitignored.
  - Agent integration test was not re-runnable (fixed UUID) and registered a live Bull processor; now isolated.
  - API tests are typechecked (`test/tsconfig.json`), and the agent test runs on Fastify with the production ValidationPipe.

- 2026-09-30: Phase 5 AI (RAG) complete.
  - Implemented `@docuflow/ai` provider abstraction (`AIProvider`, `OpenAIProvider`).
  - Added `AIModule` to API with `RAGService` for pgvector retrieval and context-augmented completion.
  - Added `ConversationsModule` for REST CRUD and SSE streaming for `POST /conversations/:id/messages`.
  - Added `AIController` for `POST /ai/documents/:id/summarize`.
  - Tests updated, 70/70 integration tests passing.

- 2026-09-30: Phases 1–4 complete (auth, documents, pipeline, search).

---

## Known Issues & Errors

- Dashboard layout is not responsive: at phone widths the sidebar squeezes the content. This affects all tabs and predates Phase 6.
- No `OPENAI_API_KEY` in local `.env`, so AI features need an org key added in Settings (by design). Verified live 2026-10-01.
- Agent workflow results render markdown as raw text (e.g. `**Finance**`).
- `metadata.model` on stored assistant messages is hardcoded to `gpt-4o-mini` instead of the model actually used.
- `20260930150932_add_search_and_embeddings` was edited after being committed (added `CREATE EXTENSION`). Checksums
  match the local dev DB. Any other DB that applied the original version would need `prisma migrate resolve`.
- `pnpm --filter @docuflow/api lint:check` fails: ESLint 9 finds no flat config for the API (pre-existing; CI lints web only).
- If a tab closes in the middle of a token refresh, the server has already rotated the token and the session is lost.
  A short reuse grace window for refresh tokens would cover this.
- **No rate limiting is active.** `ThrottlerModule` is configured but no `ThrottlerGuard` is registered (login, signup
  and invitation preview are unthrottled). Enabling it needs per-route limits that the E2E/integration suites tolerate.
- Invitations are shared as links (no email delivery or email verification yet). See ADR-012.
- Folder rename and moving folders aren't supported (documents can be moved).
- Folder-name uniqueness is checked in code only (no DB constraint), so two concurrent creates can produce a duplicate.
- When running `pnpm dev`, restart the worker after pulling: it previously ran without `main.js` (see Recent Changes).

---

## Technical Debt

1. **tsconfig extends**: `packages/config/tsconfig.base.json` not used by apps — each inlines options. Standard NestJS monorepo pattern — low priority.
2. **Semantic search graceful degradation**: If OPENAI_API_KEY not set, semantic/hybrid falls back to fulltext. This is intentional but should be documented in API responses.
3. **Embedding update perf**: Worker updates embeddings one-by-one via raw SQL. For large documents (100+ chunks), this could be slow. Future: batch UNNEST update.
4. ~~Refresh token lookup~~: fixed 2026-10-01 (`<id>.<secret>` format).
5. **Agent progress**: UI polls every 2s; SSE would be cheaper at scale.
6. **Prisma vs raw-SQL objects**: HNSW index can't be modelled. Always use `migrate dev --create-only`; CI guard enforces it.

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

Verified 2026-10-01 after the teams/folders increment (clean `pnpm dev` stack, live OpenAI): **26/26 E2E** (journey 10 · edge-cases 7 · team 7 · ai-live 2)
- `pnpm typecheck`: ✅ all 6 packages (API tests included)
- Web lint: ✅ 0 problems · Web build: ✅
- `apps/api` unit: ✅ 22/22 (auth 11 · credentials encryption/resolution 11)
- `apps/worker` unit: ✅ 7/7 (extraction + consumer retry/skip rules)
- `apps/api` integration: ✅ **159/159**. auth 18 · documents 25 · search 21 · conversations 7 · agent 19 ·
  ai-settings 11 · edge-cases 38 · team 20
- E2E team (`apps/web/e2e/team.spec.ts`): ✅ 7/7, stable over `--repeat-each=3`. Invite link → signup joins org;
  existing user accepts + switcher + resume on login; sign-in round-trip; wrong-address guard; role change/removal
  effect on the other session; folders; retry failed doc
- E2E live (`ai-live.spec.ts`, opt-in): ✅ 2/2 (full AI journey; reindex after adding a key)
- E2E edge cases (`apps/web/e2e/edge-cases.spec.ts`): ✅ 7/7 (PDF indexing + failure reason, body-text search, MIME detection, upload validation,
  persistent chat error, mixed-case login, concurrent cross-tab refresh)
- E2E (Playwright, `apps/web/e2e/journey.spec.ts`): ✅ **7/7**. Signup/logout/login, bad credentials, anonymous redirect,
  token refresh, revoked-session logout, upload → search (XSS check), agent workflow to terminal state,
  agent → Settings banner, key validation/verification (9 total)
- `pnpm db:check-migrations`: ✅
- CI (`.github/workflows/ci.yml`): written; **not yet executed** (repo has no remote)

---

## Database Migration Status

- ✅ `20260927182727_init`: full initial schema (11 tables)
- ✅ `20260930143849_change_sizebytes_to_int`: sizeBytes BIGINT → INT
- ✅ `20260930150932_add_search_and_embeddings`: pgvector, tsvector, GIN indexes, trigger
- ✅ `20260930171236_add_agent_workflows`: workflows table (⚠ also dropped search objects; generated by `migrate dev`)
- ✅ `20261001090000_restore_search_columns`: restores those search objects
- ✅ `20261001100000_add_organization_ai_credentials`: encrypted per-org AI keys
- ✅ `20261001173531_refresh_token_organization`: session organization on refresh tokens
- Verified: a fresh DB migrates cleanly with all search columns, indexes and the trigger present

---

## Current Git Branch & Commit

- Branch: `main`, HEAD `2519f0d` (Phase 5)
- Phase 6 is **uncommitted** in the working tree

---

## Exact Next Actions for Next Session

See "In Progress / Next Session" above and `tasks/current-phase.md`.

---

## Test Accounts (seeded)

| Email | Password | Role | Org |
|---|---|---|---|
| alice@acme.com | Password123! | OWNER | Acme Corp |
| bob@acme.com | Password123! | ADMIN | Acme Corp |
| carol@acme.com | Password123! | MEMBER | Acme Corp |
| dave@acme.com | Password123! | VIEWER | Acme Corp |
| eve@beta.com | Password123! | OWNER | Beta Inc |
