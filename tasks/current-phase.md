# Phase 0 — Foundation & Architecture

**Status:** PAUSED (CHECKPOINT)  
**Started:** 2026-09-26  
**Goal:** A runnable monorepo with working infrastructure, NestJS health endpoint, and Prisma connected.

---

## Success Criteria

- [x] `pnpm install` succeeds at repo root
- [x] Root monorepo structure and shared `@docuflow/config` set up
- [x] Prisma complete schema with 11 models designed and seed script written
- [x] NestJS API bootstrapped with Auth (JWT + Local), Users, Organizations, and Database modules
- [x] Unit test suite for AuthService passing (6/6 tests)
- [ ] `docker compose up -d` starts Postgres + Redis + LocalStack (pending Docker Desktop on host)
- [ ] Prisma can connect to PostgreSQL and run migrations
- [ ] `pnpm --filter @docuflow/api dev` starts the API and `GET /health` returns `{ status: 'ok' }`
- [ ] `pnpm --filter @docuflow/web dev` starts the frontend

---

## Steps

### 0.1 — Repository Scaffolding
- [x] `git init`
- [x] `.gitignore`
- [x] `pnpm-workspace.yaml`
- [x] Root `package.json`

### 0.2 — Shared Config
- [x] `packages/config/tsconfig.base.json`
- [x] `packages/config/eslint-base.js`
- [x] `packages/config/prettier.config.js`
- [x] `packages/config/package.json`

### 0.3 — Database Package
- [x] `packages/database/package.json`
- [x] `packages/database/prisma/schema.prisma`
- [x] Initial schema: User, RefreshToken, Organization, OrganizationMember, Invitation, Folder, Document, DocumentChunk, DocumentShare, Conversation, Message, AuditLog
- [x] Database seed script: `packages/database/prisma/seed.ts`
- [ ] Adjust `packages/database/tsconfig.json` & export `@prisma/client` from `packages/database/src/index.ts`

### 0.4 — API App
- [x] `apps/api` NestJS bootstrap
- [x] DatabaseService extending PrismaClient with query logging & health check
- [x] AuthModule (register, login, JWT strategy, Local strategy, password hashing, roles guard)
- [x] UsersModule and OrganizationsModule
- [x] Global validation pipe & exception filter
- [x] AuthService unit tests passing (6/6 tests)
- [ ] Add missing `passport-local` and `@types/passport-local` to `apps/api/package.json`
- [ ] Connect live Prisma database and verify `/health` endpoint

### 0.5 — Web App
- [ ] `apps/web` Next.js 15 bootstrap
- [ ] Basic landing page

### 0.6 — Docker Compose
- [x] PostgreSQL 16 with pgvector configuration
- [x] Redis 7 configuration
- [x] LocalStack (S3) configuration + `init-s3.sh`
- [x] Adminer (DB UI) configuration
- [ ] Start Docker daemon and launch containers via `pnpm infra:up`

### 0.7 — Verification
- [x] AuthService unit tests: 6 passed, 6 total
- [ ] Monorepo-wide typecheck (`pnpm typecheck`)
- [ ] All containers healthy (`docker compose ps`)
- [ ] Prisma migration runs (`pnpm db:migrate:dev`)
- [ ] API health endpoint responds `{ status: 'ok' }`

---

## Notes

- Node v24.18.0 via NVM (`~/.nvm/versions/node/v24.18.0/bin`)
- Package manager: pnpm
- Local dev containers defined in `docker-compose.yml`
