#!/usr/bin/env bash
# Creates .env.production with fresh random secrets.
#
#   ./deploy/init-env.sh <public-ip-or-domain> <email-for-https-certificates>
#
# With an IP (e.g. 203.0.113.5) the app gets free hostnames from sslip.io:
#   https://app.203-0-113-5.sslip.io  and  https://s3.203-0-113-5.sslip.io
# With your own domain (e.g. example.com), point app.example.com and
# s3.example.com at the server (DNS A records) first.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-}"; email="${2:-}"
if [[ -z "$target" || -z "$email" ]]; then
  echo "usage: $0 <public-ip-or-domain> <email>" >&2; exit 1
fi
if [[ -e .env.production ]]; then
  echo ".env.production already exists — not overwriting (it holds your secrets)." >&2; exit 1
fi

if [[ "$target" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  base="${target//./-}.sslip.io"
else
  base="$target"
fi

secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"${1:-40}"; }

umask 077
cat > .env.production <<ENV
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by deploy/init-env.sh — keep private, never commit.
APP_ADDRESS=app.${base}
S3_ADDRESS=s3.${base}
APP_URL=https://app.${base}
S3_URL=https://s3.${base}
ACME_EMAIL=${email}

POSTGRES_PASSWORD=$(secret)
REDIS_PASSWORD=$(secret)
STORAGE_ACCESS_KEY=$(secret 20)
STORAGE_SECRET_KEY=$(secret)

JWT_ACCESS_SECRET=$(secret 64)
# 32 bytes, base64. Changing it makes stored organization API keys unreadable.
AI_CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Optional server-wide fallback; organizations can add their own key in Settings.
OPENAI_API_KEY=
ENV
echo "Wrote .env.production. App will be at https://app.${base}"
