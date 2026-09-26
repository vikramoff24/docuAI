# ADR-007: pgvector for Vector Search

**Status:** Accepted  
**Date:** 2026-09-26

---

## Decision

Use **pgvector** (PostgreSQL extension) for storing and querying document embeddings.

Do **not** add a dedicated vector database (Pinecone, Weaviate, Qdrant, Chroma) at this stage.

---

## Context

For RAG (Retrieval-Augmented Generation), we need to:
1. Store vector embeddings of document chunks (~1536 dimensions for OpenAI `text-embedding-3-small`)
2. Query by similarity (cosine distance) to find the most relevant chunks for a given query

---

## Evaluation

### pgvector
- PostgreSQL extension — no new service
- HNSW index for approximate nearest neighbor (ANN) search
- Cosine, L2, inner product distance operators
- Benchmarks: handles 1M+ vectors with <100ms queries at p95 with HNSW
- Can do exact KNN or approximate with HNSW
- Same ACID guarantees as PostgreSQL
- Prisma supports it via `@db.Vector`

### Pinecone
- Fully managed vector database
- Excellent at scale (billions of vectors)
- No PostgreSQL consistency guarantees
- Additional cost, additional operational complexity

### Weaviate / Qdrant
- Self-hosted vector databases
- More features (multi-modal, filtering)
- Additional service to operate

---

## Decision Rationale

At our expected scale (millions of document chunks, not billions), pgvector is:
- **Good enough**: HNSW handles our scale with excellent latency
- **Simpler**: One fewer service
- **Consistent**: Embeddings and documents in the same transaction
- **Cheaper**: No additional managed service

**We will revisit this decision when:**
- We exceed ~50M vectors AND latency SLOs are being missed
- We need features pgvector doesn't support (multi-modal, complex filters at scale)

---

## Implementation

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- DocumentChunk table
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  chunk_index INTEGER NOT NULL,
  metadata JSONB
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Composite index for tenant-filtered searches
CREATE INDEX ON document_chunks (organization_id, document_id);
```

---

## Hybrid Search

We use **hybrid search** combining:
1. **Sparse (BM25/full-text)**: Good for keyword matches, exact terms, proper nouns
2. **Dense (vector)**: Good for semantic similarity, paraphrase matching

Fusion via **Reciprocal Rank Fusion (RRF)** to combine results.

---

## Consequences

- `packages/database` schema includes `DocumentChunk` with vector column
- pgvector extension enabled in Docker Compose (use `pgvector/pgvector:pg16` image)
- Embedding dimension must be consistent (changing requires re-embedding all documents)
- Prisma raw queries used for vector similarity search (Prisma doesn't natively support vector operators)
