# DocuFlow AI — Project State

> **This file is the single source of truth for every development session.**
> Read this first. Always. Before touching any code.

---

## Current Phase

**Phase 0 — Foundation & Architecture Setup** ✅ COMPLETE  
**Phase 1 — Auth & Organizations** 🚧 NEARLY COMPLETE (integration test fix in progress)  
**Phase 2 — Documents** 🚧 IN PROGRESS (core services scaffolded)

---

## Current Objective

Phase 1 is functionally complete. Finishing integration test fix for Redis blacklist (jti-based). Phase 2 DocumentsModule and FoldersModule are scaffolded and type-safe.

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

### Phase 1 (NEARLY COMPLETE 🚧 — 1 known issue)
- [x] Auth module (register, login, JWT + Local strategies) — written and tested
- [x] Auth integration tests (register, login, refresh, logout, cross-tenant isolation) — 17 tests written
- [x] Refresh token rotation (`POST /auth/refresh`) — implemented and tested
- [x] Token revocation via Redis blacklist (`POST /auth/logout`) — implemented
  - Uses `jti` (JWT ID UUID claim) as the Redis blacklist key
  - JwtAuthGuard checks `blacklist:<jti>` on every authenticated request
  - Auto-expires from Redis at token TTL
- [x] `RedisModule` — global, `@Global()`, exports `REDIS_CLIENT` (ioredis)
- [x] `JwtAuthGuard` — enhanced with Redis blacklist check (manual base64url decode to avoid DI issues)
- [x] Organization invitation API:
  - `POST /organizations/current/invitations` — create invitation (ADMIN/OWNER only)
  - `GET /organizations/current/invitations` — list pending invitations
  - `DELETE /organizations/current/invitations/:id` — cancel invitation
  - `POST /invitations/accept` — accept by token, creates membership
- [ ] Integration test: 2 logout/cross-tenant tests failing due to JwtAuthGuard DI issue
  - **Fix applied** (jti + manual decode, no JwtService injection) — awaiting test run confirmation

### Phase 2 (IN PROGRESS 🚧)
- [x] `DocumentsModule` scaffolded (`documents.service.ts`, `documents.controller.ts`, `documents.module.ts`)
  - `POST /documents/upload-url` — presigned S3 PUT URL + document record (PENDING)
  - `POST /documents/:id/confirm` — verify S3 upload, set PROCESSING, queue job (TODO Phase 3)
  - `GET /documents` — paginated list with search + folder filter
  - `GET /documents/:id` — document metadata
  - `GET /documents/:id/download` — presigned S3 GET URL
  - `DELETE /documents/:id` — soft delete
- [x] `StorageService` — S3-compatible (LocalStack dev / AWS prod), presigned URLs, key builder
- [x] `FoldersModule` scaffolded (`folders.service.ts`, `folders.controller.ts`, `folders.module.ts`)
  - `POST /folders` — create folder with materialized path
  - `GET /folders` — list root or children by parentId
  - `DELETE /folders/:id` — soft delete (non-empty folders rejected)
- [x] AWS SDK installed (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- [ ] Document integration tests (Phase 2)
- [ ] S3 upload flow manual smoke test

---

## Overall Progress

```
Phase 0: Foundation          ████████████████████  100% ✅
Phase 1: Auth + Orgs         ████████████████████   95% 🚧 (1 test fix pending)
Phase 2: Documents           ████████░░░░░░░░░░░░   40% (services scaffolded, untested)
Phase 3: Document Pipeline   ░░░░░░░░░░░░░░░░░░░░    0%
Phase 4: Search              ░░░░░░░░░░░░░░░░░░░░    0%
Phase 5: AI (RAG)            ░░░░░░░░░░░░░░░░░░░░    0%
Phase 6: AI Agent            ░░░░░░░░░░░░░░░░░░░░    0%
Phase 7: CI/CD + Deploy      ░░░░░░░░░░░░░░░░░░░░    0%
Phase 8: Observability       ░░░░░░░░░░░░░░░░░░░░    0%
Phase 9: Polish + Eval       ░░░░░░░░░░░░░░░░░░░░    0%
```

---

## Completed Features

- [x] Git repository initialized
- [x] Monorepo structure with pnpm workspaces (`pnpm-workspace.yaml`, root `package.json`, `.gitignore`)
- [x] Shared tooling packages: `@docuflow/config` (TSConfig base, ESLint base, Prettier)
- [x] Architecture documentation (`docs/architecture.md`, ADR-001 through ADR-009, learning modules)
- [x] Complete Prisma schema (`packages/database/prisma/schema.prisma`) with models:
  - `User`, `RefreshToken`, `Organization`, `OrganizationMember`, `Invitation`
  - `Folder`, `Document`, `DocumentChunk`, `DocumentShare`, `Conversation`, `Message`, `AuditLog`
- [x] Database seed script (`packages/database/prisma/seed.ts`) — seeded 5 users, 2 orgs
- [x] Database package public exports (`packages/database/src/index.ts`)
- [x] Local infrastructure running:
  - `docker-compose.yml` (Postgres 16 + pgvector, Redis 7, LocalStack, Adminer)
  - `infra/postgres/init.sql` (pgvector & pg_trgm extensions, db init)
  - `infra/localstack/init-s3.sh` (S3 bucket initialization)
  - All 3 containers healthy and running
- [x] Prisma migration `20260927182727_init` applied to `docuflow_dev` database
- [x] NestJS API (`apps/api` — port 3001):
  - `DatabaseModule` & `DatabaseService` extending `PrismaClient` with logging & health check
  - `RedisModule` (global) — ioredis client with retry strategy, exports `REDIS_CLIENT`
  - `AuthModule` with registration, login, JWT strategy, Local strategy, `RolesGuard`, `JwtAuthGuard` (+ Redis blacklist)
  - `UsersModule` and `OrganizationsModule`
  - `InvitationsModule` — full CRUD for org invitations
  - `DocumentsModule` — upload URL flow, CRUD, presigned download
  - `FoldersModule` — create/list/delete folder tree
  - Global `AllExceptionsFilter`, `LoggingInterceptor`, `TransformInterceptor`
  - `GET /api/v1/health` returns `{ status: 'ok', services: { database: 'ok' } }`
  - Unit tests for `AuthService` in `apps/api/src/auth/auth.service.spec.ts` (6/6 passing)
  - Integration test suite in `apps/api/test/auth.integration.ts` (17 tests — 2 logout tests need verify)
- [x] Next.js 16 Web app (`apps/web` — port 3000):
  - Stunning dark landing page with glassmorphism, mesh gradients, animations
  - Hero, features grid, mock product UI, how-it-works, pricing, CTA, footer
  - CSS-only design system in `globals.css`
- [x] BullMQ Worker app (`apps/worker` — port 3002):
  - `WorkerModule` with BullMQ/Redis configuration
  - `DocumentProcessingModule` with exponential backoff queue config
  - `DocumentProcessingConsumer` with stage-based pipeline (placeholder)
  - `DocumentProcessingService` (extract → chunk → embed → store pipeline skeleton)

---

## In Progress / Next Session

1. **Verify integration tests pass** after JwtAuthGuard fix (jti + manual base64url decode):
   - Run `pnpm --filter @docuflow/api test:integration`
   - Expected: 17/17 pass

2. **Phase 2 — Document integration tests**:
   - Write `test/documents.integration.ts` covering upload-url → S3 put → confirm → list → download → delete flow
   - LocalStack S3 must be running (already is)

3. **Phase 2 — Connect Worker to DocumentsModule**:
   - When `confirmUpload` is called, queue BullMQ job via `DocumentProcessingService`
   - Add `@docuflow/database` Prisma client to worker (currently no DB in worker)

---

## Remaining Work

See `tasks/roadmap.md` and `tasks/current-phase.md`.

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
  ai/         → AI provider abstraction (OpenAI/Anthropic/Gemini) (planned Phase 5)
  storage/    → S3-compatible storage abstraction (planned Phase 2)
  shared/     → Shared types, constants, utilities (planned)
  config/     → Shared ESLint, TypeScript, prettier configs (✅ created)
  ui/         → Shared React component library (planned)

Infrastructure (local dev — ALL RUNNING ✅):
  PostgreSQL 16 + pgvector  (port 5432)
  Redis 7                   (port 6379)
  LocalStack (S3-compatible) (port 4566)
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

- 2026-09-28: Phase 1 Phase 2 work. Added `RedisModule`, `InvitationsModule`, `DocumentsModule`, `FoldersModule`. Enhanced `JwtAuthGuard` with Redis blacklist (jti-based). Added `jti` UUID claim to every JWT. Fixed test token scoping issue in integration tests. Installed `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

---

## Known Issues & Errors

1. **Integration test fix pending verification**: JwtAuthGuard now uses manual base64url JWT decode to extract `jti` claim (no JwtService injection) to avoid DI failures across modules. Fix has been applied; test run in progress at checkpoint time.

---

## Technical Debt

1. **tsconfig extends**: `packages/config/tsconfig.base.json` isn't used by `apps/api`, `apps/worker`, or `packages/database` because ts-node/jest can't resolve workspace paths. Each app has inlined tsconfig options. This is standard for NestJS monorepos — low priority.
2. **Worker DB connection**: The worker doesn't yet have a Prisma connection. This is intentional — it will be added in Phase 3 when actual DB writes are needed.
3. **Document upload confirmation**: `confirmUpload` currently does NOT queue a BullMQ job. The queue call is stubbed with a TODO comment. Will be wired in Phase 3.
4. **Refresh token lookup**: `refreshTokens()` in `AuthService` queries all non-expired tokens and does a linear bcrypt scan — works for Phase 1, needs optimization (store jti in cookie or index) for production scale.

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

## Deployment Status

Not yet deployed. Local development only.

---

## Test Status

- `apps/api` unit: ✅ 6/6 passing (`src/auth/auth.service.spec.ts`)
- `apps/api` integration: 🚧 17 tests written; 2 logout/cross-tenant tests failing due to JwtAuthGuard DI issue — **fix applied at checkpoint**, awaiting confirmation run
- `apps/worker`: No tests yet (passWithNoTests configured)
- E2E: Not yet run

---

## Database Migration Status

- ✅ Migration `20260927182727_init` applied to `docuflow_dev`
- ✅ Database seeded (5 users, 2 organizations, 2 root folders)
- No new migrations this session (schema unchanged)

---

## Current Git Branch & Commit

- Branch: `main`
- Previous checkpoint: `670fe92` ("test(auth): add auth integration test suite")
- **Upcoming commit this session**: Phase 1 complete + Phase 2 scaffold

---

## Exact Next Actions for Next Session

### FIRST: Verify integration tests
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd /Users/vikrams/Documents/code/DocuAI
pnpm --filter @docuflow/api test:integration
```
Expected: 17/17 PASS. If still failing, the known issue is in `JwtAuthGuard.checkBlacklist()` — debug the jti extraction logic.

### THEN: Phase 2 document integration tests
- Write `apps/api/test/documents.integration.ts`
- Test: upload-url → PUT to LocalStack S3 → confirm → list → get → download → delete
- LocalStack S3 is running at `http://localhost:4566`

### THEN: Wire BullMQ job queue in confirmUpload
- Import `DocumentProcessingService` from worker (or create a shared queue client)
- Add `@InjectQueue('document-processing') private queue: Queue` to `DocumentsService`
- Call `queue.add('process', { documentId, organizationId, storageKey })` in `confirmUpload()`

## Test Accounts (seeded)

| Email | Password | Role | Org |
|---|---|---|---|
| alice@acme.com | Password123! | OWNER | Acme Corp |
| bob@acme.com | Password123! | ADMIN | Acme Corp |
| carol@acme.com | Password123! | MEMBER | Acme Corp |
| dave@acme.com | Password123! | VIEWER | Acme Corp |
| eve@beta.com | Password123! | OWNER | Beta Inc |
