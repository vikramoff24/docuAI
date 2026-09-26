-- DocuFlow AI — PostgreSQL Initialization Script
-- Runs once on first container start (Docker entrypoint)
--
-- What we do here:
-- 1. Enable pgvector extension (for vector similarity search)
-- 2. Enable pg_trgm (for fuzzy full-text search)
-- 3. Enable unaccent (for accent-insensitive search)
-- 4. Create the test database (for integration tests)

-- Enable extensions in the main database
\c docuflow_dev;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "vector";       -- pgvector (AI embeddings)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Trigram matching (fuzzy search)
CREATE EXTENSION IF NOT EXISTS "unaccent";     -- Accent-insensitive search

-- Create test database for integration tests
CREATE DATABASE docuflow_test;

\c docuflow_test;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
