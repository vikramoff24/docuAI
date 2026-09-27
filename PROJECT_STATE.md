# DocuFlow AI — Project State

> **This file is the single source of truth for every development session.**
> Read this first. Always. Before touching any code.

---

## Current Phase

**Phase 0 — Foundation & Architecture Setup** ✅ COMPLETE  
**Phase 1 — Auth & Organizations** 🚧 IN PROGRESS (core auth logic written & tested)

---

## Current Objective

Phase 0 is fully complete. All infrastructure is running, migrations applied, seed data loaded, API responding, and both web and worker apps bootstrapped. Moving into Phase 1 completion.

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

### Phase 1 (IN PROGRESS 🚧)
- [x] Auth module (register, login, JWT + Local strategies) — written and tested
- [x] Auth integration tests (register, login, refresh, logout, cross-tenant isolation)
- [ ] Refresh token rotation (currently stores in DB but rotation logic incomplete)
- [ ] Token revocation (Redis blacklist)
- [ ] Organization invite flow (Invitation model exists, controller TBD)

---

## Overall Progress

```
Phase 0: Foundation          ████████████████████  100% ✅
Phase 1: Auth + Orgs         ████████░░░░░░░░░░░░   40% (auth logic written & tested)
Phase 2: Documents           ░░░░░░░░░░░░░░░░░░░░    0%
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
  - `AuthModule` with registration, login, JWT strategy, Local strategy, `RolesGuard`, `JwtAuthGuard`
  - `UsersModule` and `OrganizationsModule`
  - Global `AllExceptionsFilter`, `LoggingInterceptor`, `TransformInterceptor`
  - `GET /api/v1/health` returns `{ status: 'ok', services: { database: 'ok' } }`
  - Unit tests for `AuthService` in `apps/api/src/auth/auth.service.spec.ts` (6/6 passing)
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

- Phase 1 completion:
  - Refresh token rotation endpoint (`POST /auth/refresh`)
  - Token revocation via Redis blacklist
  - Organization invitation API
  - Auth integration tests
- Phase 2: Document management (upload, CRUD, S3 presigned URLs)

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

- 2026-09-28: Phase 0 COMPLETE. Fixed all typecheck errors (passport-local, tsconfig inlining). Started Docker infrastructure. Applied Prisma migration. Seeded database. Verified API health endpoint. Bootstrapped Next.js 16 web app with stunning landing page. Bootstrapped BullMQ worker app.

---

## Known Issues & Errors

None. All typecheck, tests, and infrastructure verified clean.

---

## Technical Debt

1. **tsconfig extends**: `packages/config/tsconfig.base.json` isn't used by `apps/api`, `apps/worker`, or `packages/database` because ts-node/jest can't resolve workspace paths. Each app has inlined tsconfig options. This is standard for NestJS monorepos — low priority.
2. **Worker DB connection**: The worker doesn't yet have a Prisma connection. This is intentional — it will be added in Phase 3 when actual DB writes are needed.

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
| API Server | ✅ Running | Port 3001 (dev mode) |
| Web Server | ✅ Running | Port 3000 (Next.js dev) |

---

## Deployment Status

Not yet deployed. Local development only.

---

## Test Status

- `apps/api`: Unit tests passing (`src/auth/auth.service.spec.ts`: 6/6 passed)
- `apps/worker`: No tests yet (passWithNoTests configured)
- Integration/E2E: Not yet run (Phase 1 goal)

---

## Database Migration Status

- ✅ Migration `20260927182727_init` applied to `docuflow_dev`
- ✅ Database seeded (5 users, 2 organizations, 2 root folders)

---

## Current Git Branch & Commit

- Branch: `main`
- Last checkpoint commit: `d1a6a23` ("chore(checkpoint): pause development at Phase 0 foundation and API scaffolding")
- Upcoming commit: Phase 0 complete checkpoint

---

## Exact Next Actions for Next Session

1. **Complete Phase 1 Auth**:
   - Implement `POST /auth/refresh` endpoint for refresh token rotation
   - Add Redis token blacklisting to `AuthService.logout()`
   - Write integration tests for auth endpoints
   
2. **Organization Invitations**:
   - `POST /organizations/:id/invitations` — create invitation, send email (placeholder)
   - `POST /invitations/:token/accept` — accept invite, create member record
   
3. **Phase 2 Documents**:
   - `POST /documents/upload-url` — return presigned S3 PUT URL
   - `POST /documents/:id/confirm` — confirm upload, trigger processing job
   - `GET /documents` — paginated document list
   - `GET /documents/:id` — get document with metadata
   - `DELETE /documents/:id` — soft delete

## Test Accounts (seeded)

| Email | Password | Role | Org |
|---|---|---|---|
| alice@acme.com | Password123! | OWNER | Acme Corp |
| bob@acme.com | Password123! | ADMIN | Acme Corp |
| carol@acme.com | Password123! | MEMBER | Acme Corp |
| dave@acme.com | Password123! | VIEWER | Acme Corp |
| eve@beta.com | Password123! | OWNER | Beta Inc |
