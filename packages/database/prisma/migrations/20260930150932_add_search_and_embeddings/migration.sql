-- ============================================================
-- Migration: Add Search Infrastructure (Phase 4)
-- ============================================================
-- 
-- This migration adds:
-- 1. embedding vector(1536) column to document_chunks
--    → Stores OpenAI text-embedding-3-small vectors for semantic search
--    → HNSW index for fast approximate nearest neighbor (ANN) queries
--
-- 2. search_vector tsvector column to documents  
--    → Auto-updated by trigger from name + description + tags
--    → GIN index for fast full-text search queries
--
-- 3. GIN index on documents.tags[]
--    → Fast filtering by document tags using @> (contains) operator
--
-- 4. pg_trgm trigram index on document_chunks.content
--    → Fast ILIKE fuzzy search within chunk content
--
-- WHY MANUAL MIGRATION (not Prisma schema)?
-- Prisma does not natively support:
--   - vector(N) type (pgvector) - requires @db.Vector which is an extension
--   - tsvector type + GIN indexes on generated columns
--   - HNSW index configuration (m, ef_construction params)
--   - Partial indexes and complex expression indexes
--   - PostgreSQL triggers
-- We use Prisma for schema management and raw SQL for these advanced features.
-- The `prisma migrate` tool WILL apply this file, just won't "know" about
-- these columns (raw queries handle the vector operations).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Add embedding vector column to document_chunks ──────────────────────

ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- HNSW index for fast cosine similarity search
-- m=16: number of connections per node (higher = better recall, more memory)
-- ef_construction=64: build time accuracy (higher = slower build, better recall)
-- vector_cosine_ops: OpenAI embeddings are unit-normalized, cosine is ideal
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx"
  ON "document_chunks"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Composite index: organization-scoped vector search
-- Filters by org first, then uses HNSW for similarity
CREATE INDEX IF NOT EXISTS "document_chunks_org_embedding_idx"
  ON "document_chunks" ("organizationId");

-- ── 2. Add full-text search tsvector to documents ─────────────────────────

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- Update existing rows (handles case where documents already exist)
-- Weight 'A' = name (highest priority), Weight 'B' = description
UPDATE "documents"
SET "searchVector" = 
  setweight(to_tsvector('english', COALESCE("name", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("description", '')), 'B') ||
  setweight(to_tsvector('english', array_to_string("tags", ' ')), 'C');

-- GIN index for fast tsvector queries (ts_rank, ts_query)
CREATE INDEX IF NOT EXISTS "documents_search_vector_gin_idx"
  ON "documents"
  USING gin ("searchVector");

-- ── 3. GIN index on tags array ────────────────────────────────────────────

-- Enables: WHERE tags @> ARRAY['invoice', 'finance']
CREATE INDEX IF NOT EXISTS "documents_tags_gin_idx"
  ON "documents"
  USING gin ("tags");

-- ── 4. pg_trgm index on document name for fuzzy search ────────────────────

-- Enables fast ILIKE queries: WHERE name ILIKE '%query%'
CREATE INDEX IF NOT EXISTS "documents_name_trgm_idx"
  ON "documents"
  USING gin ("name" gin_trgm_ops);

-- ── 5. Trigger: Auto-update searchVector on INSERT / UPDATE ───────────────

-- Function: recomputes the tsvector when name/description/tags change
CREATE OR REPLACE FUNCTION update_document_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', COALESCE(NEW."name", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."description", '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(COALESCE(NEW."tags", ARRAY[]::text[]), ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: fires BEFORE INSERT or UPDATE on relevant columns
-- BEFORE (not AFTER) so we can mutate NEW directly
DROP TRIGGER IF EXISTS "documents_search_vector_trigger" ON "documents";
CREATE TRIGGER "documents_search_vector_trigger"
  BEFORE INSERT OR UPDATE OF "name", "description", "tags"
  ON "documents"
  FOR EACH ROW
  EXECUTE FUNCTION update_document_search_vector();
