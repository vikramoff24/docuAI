# DocuFlow AI — System Architecture

## Overview

DocuFlow AI is a **multi-tenant SaaS application** for enterprise document management with AI capabilities. It is built as a **modular monolith** — a single deployable unit with clear internal module boundaries, designed to be extracted into microservices if and when genuine scale justifies it.

---

## Why a Modular Monolith?

This is one of the most important architectural decisions we made. See **ADR-002** for the full rationale.

**Short answer:**

A distributed system (microservices) is operationally complex:
- You need service discovery, inter-service authentication, distributed tracing, network failures, saga patterns for distributed transactions, and contract testing.
- These costs are justified only when teams or services need to scale independently.

A modular monolith gives you:
- Clear module boundaries (preparing for future extraction)
- Simple deployment (one container to start with)
- Simple transactions (Postgres ACID)
- Simple debugging (one log stream, one process)
- Fast development velocity

We use **NestJS modules** to enforce boundaries. Each NestJS module is a self-contained domain. Inter-domain communication happens only through well-defined interfaces (service injection or events), never through direct DB access across modules.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Next.js 15 (apps/web)                                     │ │
│  │  React, TypeScript, Tailwind, shadcn/ui, TanStack Query    │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / REST / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                        API Layer                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  NestJS API (apps/api)                                     │ │
│  │  Modules: Auth, Users, Orgs, Documents, Folders,          │ │
│  │           Search, AI, Agent, AuditLog                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
      │          │          │          │          │
  ┌───▼──┐  ┌───▼──┐  ┌───▼──┐  ┌───▼──┐  ┌───▼──────┐
  │  PG  │  │Redis │  │  S3  │  │  AI  │  │  Worker  │
  │  16  │  │  7   │  │ Local│  │ APIs │  │  (BullMQ)│
  │+pgvec│  │      │  │ stack│  │      │  │          │
  └──────┘  └──────┘  └──────┘  └──────┘  └──────────┘
```

---

## Monorepo Structure

```
DocuAI/                         ← repo root
├── apps/
│   ├── web/                    ← Next.js 15 frontend
│   ├── api/                    ← NestJS REST API
│   └── worker/                 ← BullMQ worker process
├── packages/
│   ├── database/               ← Prisma schema + migrations + client
│   ├── ai/                     ← AI provider abstraction
│   ├── storage/                ← S3 storage abstraction
│   ├── shared/                 ← Shared TS types, constants, utils
│   ├── ui/                     ← React component library
│   └── config/                 ← Shared ESLint/TS/Prettier configs
├── docs/
│   ├── architecture.md         ← This file
│   ├── backend.md
│   ├── database.md
│   ├── api.md
│   ├── ai.md
│   ├── security.md
│   ├── testing.md
│   ├── deployment.md
│   ├── observability.md
│   ├── adr/                    ← Architecture Decision Records
│   └── learning/               ← Backend learning curriculum
├── tasks/
│   ├── roadmap.md
│   ├── current-phase.md
│   ├── completed.md
│   └── blocked.md
├── docker-compose.yml          ← Local dev infrastructure
├── docker-compose.prod.yml     ← Production docker compose
├── .github/workflows/          ← CI/CD pipelines
├── PROJECT_STATE.md            ← Primary session state
└── pnpm-workspace.yaml         ← pnpm monorepo config
```

---

## Domain Model

```
Organization
├── id (UUID)
├── name
├── slug (unique URL-safe identifier)
├── plan (FREE | PRO | ENTERPRISE)
└── settings

User
├── id (UUID)
├── email (global unique)
├── passwordHash
└── profile

OrganizationMember  ← JOIN table: User ↔ Organization
├── userId
├── organizationId
└── role (OWNER | ADMIN | MEMBER | VIEWER)

Folder
├── id
├── organizationId     ← TENANT BOUNDARY
├── parentFolderId     ← nullable, self-referential
├── name
└── createdBy

Document
├── id
├── organizationId     ← TENANT BOUNDARY
├── folderId
├── name
├── mimeType
├── sizeBytes
├── storageKey         ← S3 object key
├── status (PENDING | PROCESSING | READY | FAILED)
├── metadata (JSONB)
└── createdBy

DocumentChunk          ← For RAG
├── id
├── documentId
├── content
├── embedding          ← pgvector vector(1536)
└── chunkIndex

AuditLog
├── id
├── organizationId     ← TENANT BOUNDARY
├── userId
├── action
├── resourceType
├── resourceId
└── metadata (JSONB)

Conversation           ← AI chat sessions
├── id
├── organizationId     ← TENANT BOUNDARY
├── userId
└── title

Message
├── id
├── conversationId
├── role (USER | ASSISTANT | TOOL)
├── content
└── metadata (JSONB)
```

---

## Request Lifecycle

Every HTTP request to the API follows this path:

```
Browser / Client
     │
     ▼
DNS Resolution
     │
     ▼
TLS Termination (load balancer in prod, direct in dev)
     │
     ▼
NestJS HTTP Server (Fastify adapter)
     │
     ▼
Global Middleware
     ├── Request ID injection (x-request-id header)
     ├── Structured logging
     └── Rate limiting (Redis-backed)
     │
     ▼
Guards (run before route handler)
     ├── JwtAuthGuard      → validates JWT, populates req.user
     └── RbacGuard         → checks org membership + role
     │
     ▼
Interceptors (wrap the handler)
     ├── LoggingInterceptor  → logs request/response
     └── TransformInterceptor → normalizes response shape
     │
     ▼
Pipes (validate/transform input)
     └── ValidationPipe (class-validator + class-transformer)
     │
     ▼
Controller (route handler)
     │
     ▼
Service (business logic)
     │
     ├── Prisma Client → PostgreSQL
     ├── Redis Client  → Cache
     ├── S3 Client     → Object Storage
     └── BullMQ        → Job Queue
     │
     ▼
Response (JSON)
     │
     ▼
Browser / Client
```

---

## Multi-Tenancy Strategy

**Choice: Application-level isolation (single database, org_id foreign key)**

Every tenant-owned resource has `organizationId` as a foreign key. Every query in a service always filters by `organizationId` extracted from the authenticated user's JWT.

**Why not separate schemas or databases per tenant?**
- We are pre-product-market-fit. Separate DB per tenant is operationally expensive.
- Application-level isolation with correct query patterns is safe and standard.
- We can migrate to schema-per-tenant later if needed.

**Defense in depth:**
1. JWT contains `organizationId`
2. Every service method receives `organizationId` as a parameter (not trusted from client)
3. Prisma queries ALWAYS include `where: { organizationId }` for tenant resources
4. Integration tests explicitly test cross-tenant access prevention

See `docs/security.md` for more detail.

---

## Document Processing Pipeline

```
Client
  │
  ▼ POST /documents/upload
API (creates DB record, generates presigned S3 PUT URL)
  │
  ▼ Client uploads file directly to S3 (presigned URL)
  │
  ▼ Client calls POST /documents/:id/confirm
API
  │ Enqueues job to Redis via BullMQ
  ▼
Queue: document-processing
  │
  ▼
Worker (apps/worker)
  ├── Download from S3
  ├── Extract text (pdf-parse, mammoth, etc.)
  ├── Split into chunks (recursive text splitter)
  ├── Generate embeddings (AI provider)
  ├── Store chunks + embeddings in PostgreSQL (pgvector)
  └── Update document status → READY
  │
  ▼
Document available for semantic search + RAG
```

**Why async?** Text extraction, embedding generation, and database writes for a large document can take 30-120 seconds. You never want to block an HTTP request for that long. The upload API responds in < 200ms. The processing happens asynchronously.

---

## AI Architecture

```
Stage 1: LLM API          → Direct OpenAI/Anthropic calls
Stage 2: Structured output → JSON mode / function calling for parsing
Stage 3: Embeddings        → Store document chunks as vectors
Stage 4: RAG               → Retrieve relevant chunks, inject into prompt
Stage 5: Tool calling      → Agent can call document management tools
Stage 6: Agent loop        → ReAct loop: Reason → Act → Observe → Repeat
Stage 7: Agent evaluation  → Automated evals on retrieval + reasoning
Stage 8: Agent security    → Prompt injection defense, tool authorization
```

**AI Provider Abstraction (`packages/ai`):**
All AI calls go through a `LanguageModelProvider` interface. This means:
- You can swap OpenAI for Anthropic or Gemini with zero business logic changes
- You can run evals comparing providers
- You can route different use cases to different models

---

## Security Architecture

| Layer | Controls |
|---|---|
| Transport | TLS everywhere, HSTS |
| Authentication | JWT (RS256), refresh token rotation |
| Authorization | RBAC (role on org membership), resource-level checks |
| Multi-tenancy | `organizationId` on every query |
| Input validation | class-validator, Zod (frontend), file type validation |
| Storage | Signed URLs (never expose S3 credentials) |
| Rate limiting | Redis token bucket per IP + per user |
| AI | Prompt injection defense, tool authorization, audit logging |
| Secrets | Environment variables, never in code |

---

## Technology Decisions

| Concern | Technology | Why |
|---|---|---|
| Frontend | Next.js 15 | App Router, SSR, TypeScript first |
| Backend | NestJS | Opinionated, modular, TypeScript native |
| Database | PostgreSQL 16 | ACID, JSON support, pgvector |
| ORM | Prisma | Type-safe, migration-based, great DX |
| Cache/Queue | Redis + BullMQ | Battle-tested, reliable, BullMQ built on Redis |
| Storage | S3 / LocalStack | Industry standard, cheap, scalable |
| AI | Provider abstraction | Not locked to one provider |
| Vector DB | pgvector | No extra infra at this scale |
| Package manager | pnpm | Fast, efficient, workspace support |
| Containerization | Docker | Reproducible environments |
