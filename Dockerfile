# syntax=docker/dockerfile:1
#
# One image for the API, the worker and the web app (docker-compose.prod.yml
# picks the command). Sharing an image means its layers are stored once.
#
#   docker build -t docuflow .

FROM node:24-bookworm-slim AS base
# openssl: Prisma's query engine
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ── Build ───────────────────────────────────────────────────────────────
FROM base AS build
# Toolchain for native modules without a prebuilt binary (bcrypt)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifests first, so dependency installs are cached across code changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm db:generate && pnpm build

# ── Runtime ─────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
# next start writes its cache under .next; everything else stays read-only
RUN chown -R node:node /app/apps/web/.next
USER node
