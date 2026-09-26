# ADR-003: PostgreSQL 16 as Primary Database

**Status:** Accepted  
**Date:** 2026-09-26

---

## Context

We need a primary data store. Key requirements:
- ACID transactions (critical for multi-tenant data)
- JSON support (for metadata and audit logs)
- Vector search support (for document embeddings / RAG)
- Strong TypeScript ORM support
- Mature, battle-tested

---

## Decision

Use **PostgreSQL 16** with the **pgvector** extension.

Use **Prisma** as the ORM.

---

## Why PostgreSQL over alternatives

| Feature | PostgreSQL | MySQL | MongoDB | SQLite |
|---|---|---|---|---|
| ACID transactions | ✅ Full | ✅ | ✅ (partial) | ✅ |
| JSON support | ✅ JSONB | ✅ limited | ✅ native | ❌ |
| Vector search | ✅ pgvector | ❌ | ✅ Atlas Vector | ❌ |
| Row-level security | ✅ | ❌ | ❌ | ❌ |
| Full-text search | ✅ native | ✅ limited | ✅ Atlas | ❌ |
| Scalability | ✅ excellent | ✅ | ✅ | ❌ |
| TypeScript ORMs | ✅ excellent | ✅ | ✅ | ✅ |

PostgreSQL wins on every axis that matters for this application.

---

## Why pgvector over a dedicated vector database (Pinecone, Weaviate, Qdrant)

At our scale (thousands to low millions of document chunks), pgvector running inside PostgreSQL is:
- **Simpler**: No separate service to operate, monitor, secure
- **Consistent**: Embeddings and documents live in the same transaction boundary
- **Cheaper**: No additional managed service costs
- **Good enough**: pgvector with HNSW indexing handles millions of vectors efficiently

We will add a dedicated vector database **only** if benchmarks show pgvector is a bottleneck. See **ADR-007**.

---

## Why Prisma over alternatives

| Feature | Prisma | TypeORM | Drizzle | Kysely |
|---|---|---|---|---|
| Type safety | ✅ Generated types | ⚠️ decorator-based | ✅ | ✅ |
| Migration system | ✅ prisma migrate | ✅ | ✅ | ❌ (manual) |
| Schema-first | ✅ (schema.prisma) | ❌ (code-first) | ✅ | N/A |
| NestJS support | ✅ first-class | ✅ | ✅ | ✅ |
| Raw SQL escape | ✅ Prisma.$queryRaw | ✅ | ✅ | ✅ |
| Maturity | High | High | Growing | Growing |

Prisma's schema-first approach means:
- Schema is the single source of truth
- Types are generated — never drift from schema
- Migrations are file-based and version-controlled

---

## Consequences

- PostgreSQL runs in Docker locally, managed service (RDS/Supabase) in production
- pgvector extension must be enabled: `CREATE EXTENSION vector`
- Prisma client is generated and shared via `packages/database`
- All raw SQL for complex queries uses `prisma.$queryRaw` with tagged template literals (SQL injection safe)
