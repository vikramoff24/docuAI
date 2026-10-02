# DocuFlow AI — Roadmap

## Phase 0: Foundation & Architecture ← CURRENT

**Goal:** Monorepo, tooling, infrastructure, documentation.

- [ ] Git repository + `.gitignore`
- [ ] pnpm workspaces
- [ ] Root `package.json` with workspace scripts
- [ ] `packages/config` (TypeScript, ESLint, Prettier)
- [ ] `packages/database` (Prisma schema placeholder)
- [ ] `apps/api` (NestJS bootstrap)
- [ ] `apps/web` (Next.js bootstrap)
- [ ] `apps/worker` (NestJS lite bootstrap)
- [ ] Docker Compose (Postgres 16 + pgvector, Redis 7, LocalStack)
- [ ] Initial Prisma schema (User, Organization, OrganizationMember)
- [ ] First database migration
- [ ] Health check endpoint

---

## Phase 1: Authentication & Authorization

**Goal:** Secure, production-grade auth + multi-tenant org management.

- [ ] User registration (email + password)
- [ ] Password hashing (bcrypt)
- [ ] JWT access tokens (RS256)
- [ ] Refresh token rotation
- [ ] Token revocation (Redis blacklist)
- [ ] Organization creation
- [ ] Organization member invite flow
- [ ] RBAC: OWNER, ADMIN, MEMBER, VIEWER roles
- [ ] JwtAuthGuard (NestJS guard)
- [ ] RbacGuard (NestJS guard)
- [ ] AuthDecorator for route metadata
- [ ] Auth integration tests
- [ ] Cross-tenant access prevention tests

Learning: HTTP, JWT, bcrypt, NestJS guards, middleware vs. guards, RBAC

---

## Phase 2: Document Management

**Goal:** Full CRUD for documents and folders with S3 storage.

- [ ] Folder creation, rename, delete (soft delete)
- [ ] Folder tree structure (self-referential)
- [ ] Document upload API (presigned S3 PUT URL)
- [ ] Document confirmation API
- [ ] Document metadata
- [ ] Document list (paginated, cursor-based)
- [ ] Document download (presigned S3 GET URL)
- [ ] Document move (between folders)
- [ ] Document sharing (share link / user invitation)
- [ ] Soft delete with restore
- [ ] Audit log for all document operations
- [ ] File type validation
- [ ] Virus scan placeholder (ClamAV in future)

Learning: S3 presigned URLs, cursor pagination, soft delete, audit logging

---

## Phase 3: Document Processing Pipeline

**Goal:** Async document processing for text extraction + embeddings.

- [ ] BullMQ queue setup (`document-processing`)
- [ ] Worker app (`apps/worker`)
- [ ] Text extraction (PDF, DOCX, TXT)
- [ ] Text chunking (recursive splitter)
- [ ] Embedding generation (AI provider)
- [ ] pgvector storage
- [ ] Document status tracking
- [ ] Job retry with exponential backoff
- [ ] Dead letter queue concept
- [ ] Worker health monitoring

Learning: Queues, workers, retries, backoff, idempotency, job states

---

## Phase 4: Search

**Goal:** Full-text search + semantic (vector) search.

- [ ] PostgreSQL full-text search (ts_vector, ts_query)
- [ ] Semantic search via pgvector (cosine similarity)
- [ ] Hybrid search (RRF fusion)
- [ ] Search filters (type, date, folder, tags)
- [ ] Search result highlighting
- [ ] Search API endpoint

Learning: Full-text search, vector search, indexes, query planning

---

## Phase 5: AI — Summaries + Q&A (RAG)

**Goal:** Document summarization and question answering with citations.

- [ ] AI provider abstraction (`packages/ai`)
- [ ] Document summarization
- [ ] Q&A over a single document
- [ ] Q&A over organization documents (RAG)
- [ ] Citation generation (source chunks)
- [ ] Conversation history storage
- [ ] Streaming responses (SSE)

Learning: LLMs, prompting, RAG, embeddings, context windows, citations

---

## Phase 6: AI Agent

**Goal:** Document management agent with tool calling.

- [ ] Agent tools: searchDocuments, getDocument, listFolders, createFolder,
     moveDocument, summarizeDocument, shareDocument, getAuditLogs
- [ ] ReAct agent loop
- [ ] Agent authorization (tools respect RBAC)
- [ ] Prompt injection defense
- [ ] Agent audit logging
- [ ] Agent action controls (max iterations, budget)

Learning: Tool calling, agent loops, ReAct, prompt injection, AI security

---

## Phase 7: Observability

**Goal:** Production-grade logging, metrics, tracing.

- [ ] Structured logging (pino)
- [ ] Request ID injection
- [ ] OpenTelemetry tracing
- [ ] Prometheus metrics
- [ ] Error tracking (Sentry)
- [ ] Health check endpoints (liveness + readiness)

---

## Phase 8: CI/CD + Deployment

**Goal:** Automated pipeline from commit to production.

- [x] GitHub Actions: lint, typecheck, unit tests, integration tests, build (+ E2E)
- [x] Docker images for API + Worker + Web (one shared image)
- [x] docker-compose.prod.yml (single VM, Caddy HTTPS; docs/deployment.md)
- [ ] Environment configuration (dev, staging, prod)
- [x] Database migration on deploy
- [x] Health check verification post-deploy (deploy/deploy.sh)
- [ ] Rollback strategy

---

## Phase 9: Polish, Security Hardening, AI Evaluation

**Goal:** Production readiness.

- [x] E2E tests with Playwright
- [ ] AI evaluation framework
- [x] Rate limiting (ADR-013)
- [ ] CORS configuration
- [ ] Helmet (security headers)
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Performance testing
- [ ] Security audit
