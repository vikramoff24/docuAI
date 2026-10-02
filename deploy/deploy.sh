#!/usr/bin/env bash
# Build the image and (re)start the production stack. Safe to re-run: migrations
# are applied before the API and worker start, and data lives in named volumes.
#
#   ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env.production ]] || { echo "Missing .env.production — run ./deploy/init-env.sh first." >&2; exit 1; }
compose() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }

echo "▸ Building image…"
docker build -t docuflow:latest .

echo "▸ Starting stack (migrations run first)…"
compose up -d --remove-orphans --wait

app_url=$(grep -E '^APP_URL=' .env.production | cut -d= -f2-)
echo "▸ Checking ${app_url}/api/v1/health …"
for i in $(seq 1 30); do
  if curl -fsS "${app_url}/api/v1/health" >/dev/null 2>&1; then
    echo "✓ DocuFlow is up at ${app_url}"; exit 0
  fi
  sleep 5
done
echo "✗ Health check failed. Inspect: docker compose -f docker-compose.prod.yml logs --tail 100 api caddy" >&2
exit 1
