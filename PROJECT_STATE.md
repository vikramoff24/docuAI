# DocuFlow AI — Project State

> **This file is the single source of truth for every development session.**
> Read this first. Always. Before touching any code.

---

## Current Phase

**Phase 0 — Foundation & Architecture Setup** (and Initial Phase 1 Auth/DB Scaffolding) ⏸️ PAUSED AT CHECKPOINT

---

## Current Objective

Monorepo scaffolding, configuration, infrastructure definitions, and core API Auth/DB foundation have been created. Paused for safe checkpoint.

---

## Current Task Status

- [x] Inspect repository
- [x] Initialize git
- [x] Create monorepo with pnpm workspaces
- [x] Configure TypeScript, ESLint, Prettier
- [x] Create Docker Compose configuration (Postgres 16 + pgvector, Redis 7, LocalStack S3, Adminer)
- [x] Create Prisma schema with complete multi-tenant data model (11 models)
- [x] Bootstrap NestJS API app with Auth, Users, Organizations, and Database modules
- [x] Implement Auth module (registration, login, JWT + Local strategies, guards, bcrypt hashing)
- [x] Implement AuthService unit test suite (6/6 tests passing)
- [ ] Install Docker Desktop on host (requires manual sudo/installer)
- [ ] Resolve `passport-local` package in `apps/api` and `tsconfig.json` in `packages/database`
- [ ] Start Docker infrastructure (`pnpm infra:up`)
- [ ] Run initial Prisma database migration (`pnpm db:migrate:dev`)
- [ ] Bootstrap Next.js 15 Web app (`apps/web`)
- [ ] Bootstrap BullMQ Worker app (`apps/worker`)

---

## Overall Progress

```
Phase 0: Foundation          ██████████████░░░░░░  70% (paused)
Phase 1: Auth + Orgs         ████████░░░░░░░░░░░░  40% (auth logic written & tested)
Phase 2: Documents           ░░░░░░░░░░░░░░░░░░░░   0%
Phase 3: Document Pipeline   ░░░░░░░░░░░░░░░░░░░░   0%
Phase 4: Search              ░░░░░░░░░░░░░░░░░░░░   0%
Phase 5: AI (RAG)            ░░░░░░░░░░░░░░░░░░░░   0%
Phase 6: AI Agent            ░░░░░░░░░░░░░░░░░░░░   0%
Phase 7: CI/CD + Deploy      ░░░░░░░░░░░░░░░░░░░░   0%
Phase 8: Observability       ░░░░░░░░░░░░░░░░░░░░   0%
Phase 9: Polish + Eval       ░░░░░░░░░░░░░░░░░░░░   0%
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
- [x] Database seed script (`packages/database/prisma/seed.ts`)
- [x] Local infrastructure definitions:
  - `docker-compose.yml` (Postgres 16 + pgvector, Redis 7, LocalStack, Adminer)
  - `infra/postgres/init.sql` (pgvector & pg_trgm extensions, db init)
  - `infra/localstack/init-s3.sh` (S3 bucket initialization)
- [x] NestJS API (`apps/api`):
  - `DatabaseModule` & `DatabaseService` extending `PrismaClient` with logging & health check
  - `AuthModule` with registration, login, JWT strategy, Local strategy, `RolesGuard`, `JwtAuthGuard`
  - `UsersModule` and `OrganizationsModule`
  - Global `AllExceptionsFilter`, `LoggingInterceptor`, `TransformInterceptor`
  - Unit tests for `AuthService` in `apps/api/src/auth/auth.service.spec.ts` (6/6 passing)

---

## In Progress / Paused

- Host Docker setup (Docker Desktop needs to be installed/running on the macOS system)
- Typecheck fixes in `apps/api` (missing `passport-local`) and `packages/database` (tsconfig rootDir)
- Bootstrapping `apps/web` and `apps/worker`

---

## Remaining Work

See `tasks/roadmap.md` and `tasks/current-phase.md`.

---

## Current Architecture

```
DocuFlow AI — Modular Monolith
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
apps/
  web/        → Next.js 15, TypeScript, Tailwind, shadcn/ui (pending bootstrap)
  api/        → NestJS, TypeScript, Prisma, Passport, Fastify/Express (bootstrapped)
  worker/     → NestJS (lightweight), BullMQ workers (pending bootstrap)

packages/
  database/   → Prisma schema (11 models), seed, migrations (schema created)
  ai/         → AI provider abstraction (OpenAI/Anthropic/Gemini) (planned)
  storage/    → S3-compatible storage abstraction (planned)
  shared/     → Shared types, constants, utilities (planned)
  config/     → Shared ESLint, TypeScript, prettier configs (created)
  ui/         → Shared React component library (planned)

Infrastructure (local dev):
  PostgreSQL 16 + pgvector
  Redis 7
  LocalStack (S3-compatible)
  Adminer (DB Web GUI)
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

- 2026-09-27: Paused development for safe checkpoint. Monorepo scaffolding, Prisma schema, Docker compose configuration, NestJS API auth/org/users modules, and auth unit tests verified.

---

## Known Issues & Errors

1. **Docker not running**: Docker Desktop is not yet installed / running on the macOS host (brew cask install was cancelled because it requires interactive sudo).
2. **Missing `passport-local` in `apps/api`**: `src/auth/strategies/local.strategy.ts` requires `passport-local` and `@types/passport-local` to be added to `apps/api/package.json`.
3. **TypeScript rootDir error in `packages/database`**: `packages/database/tsconfig.json` specifies `"rootDir": "./src"`, but `prisma/seed.ts` is in `prisma/` and `packages/database/src/index.ts` is not yet created.

---

## Technical Debt

None yet (early scaffolding phase).

---

## Environment Status

| Service | Status | Notes |
|---|---|---|
| Node.js | ✅ v24.18.0 via NVM | Located in `~/.nvm/versions/node/v24.18.0/bin` |
| pnpm | ✅ v9.x via NVM | Located in `~/.nvm/versions/node/v24.18.0/bin` |
| PostgreSQL | ⏸️ Not running | `docker-compose.yml` configured; awaiting Docker daemon |
| Redis | ⏸️ Not running | `docker-compose.yml` configured; awaiting Docker daemon |
| LocalStack | ⏸️ Not running | `docker-compose.yml` configured; awaiting Docker daemon |

---

## Deployment Status

Not yet deployed. Local development only.

---

## Test Status

- `apps/api`: Unit tests passing (`src/auth/auth.service.spec.ts`: 6/6 passed)
- Integration/E2E: Not yet run (requires running PostgreSQL container)

---

## Database Migration Status

- Prisma schema created (`packages/database/prisma/schema.prisma`)
- Migrations not yet applied to database (requires running PostgreSQL container)

---

## Current Git Branch & Commit

- Branch: `main`
- Last checkpoint commit: `bdf60be` ("chore(checkpoint): pause development at Phase 0 foundation and API scaffolding")

---

## Exact Next Actions for Next Session

1. **Fix package and tsconfig dependencies**:
   - In `apps/api`: add `passport-local` and `@types/passport-local`
   - In `packages/database`: add `src/index.ts` (exporting `@prisma/client`) and adjust `tsconfig.json` rootDir
2. **Start Docker Infrastructure**:
   - Ensure Docker Desktop is installed and running on the machine
   - Run `pnpm infra:up` (`docker compose up -d`) to start Postgres, Redis, LocalStack, Adminer
3. **Run Prisma Migrations**:
   - Run `pnpm db:migrate:dev --name init` to create and apply initial database migrations
   - Run `pnpm db:seed` to seed initial users and organizations
4. **Bootstrap Apps**:
   - Run `pnpm --filter @docuflow/api dev` and verify `GET /health` returns `{ status: 'ok' }`
   - Bootstrap `apps/web` (Next.js 15) and `apps/worker`
