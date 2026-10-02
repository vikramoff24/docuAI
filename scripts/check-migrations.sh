#!/usr/bin/env bash
# Fails if a Prisma migration drops the raw-SQL search/vector objects.
#
# Prisma can't model the pgvector HNSW index (and only partially models the
# tsvector/trigram setup), so `prisma migrate dev` keeps proposing to drop them.
# Always generate with `prisma migrate dev --create-only`, delete those
# statements, then apply. See docs/adr/ADR-010-agent-workflows.md.
set -euo pipefail

MIGRATIONS_DIR="$(dirname "$0")/../packages/database/prisma/migrations"

# Historical migrations that dropped these objects before this guard existed
# (restored by 20261001090000_restore_search_columns).
ALLOWLIST=("20260930171236_add_agent_workflows")

PROTECTED='document_chunks_embedding_hnsw_idx|documents_search_vector_gin_idx|documents_tags_gin_idx|documents_name_trgm_idx|documents_search_vector_trigger|update_document_search_vector|"embedding"|"searchVector"'

status=0
for file in "$MIGRATIONS_DIR"/*/migration.sql; do
  name="$(basename "$(dirname "$file")")"
  [[ " ${ALLOWLIST[*]} " == *" $name "* ]] && continue
  while IFS= read -r line; do
    object=$(grep -oE "$PROTECTED" <<<"$line" | head -1)
    # A drop followed by a re-create in the same file (e.g. DROP TRIGGER IF
    # EXISTS …; CREATE TRIGGER …) is a safe replace, not a removal.
    if grep -qE "(CREATE|ADD COLUMN).*${object}" "$file"; then
      continue
    fi
    echo "✗ $name drops protected object ${object}:"
    echo "    $line"
    status=1
  done < <(grep -nE "^\s*(DROP|ALTER TABLE .* DROP)" "$file" | grep -E "$PROTECTED" || true)
done

[[ $status -eq 0 ]] && echo "✓ No migration drops protected search/vector objects"
exit $status
