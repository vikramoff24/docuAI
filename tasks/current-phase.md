# Phase 6: AI Agent — Workflows (end-to-end)

## Goal
Users describe a task in the UI, and an LLM agent carries it out in the background using tools that are tenant-scoped, role-checked and audited: categorizing documents, extracting data, or general metadata work. Design: `docs/adr/ADR-010-agent-workflows.md`.

## Status: ✅ Core complete (2026-10-01)

| Layer | Deliverable | Status |
|---|---|---|
| Database | `Workflow` model + `WorkflowStatus` enum; search columns declared `Unsupported` so Prisma stops dropping them | ✅ |
| Backend API | `POST/GET /workflows`, `GET /workflows/:id`; MEMBER+ to create; `instructions` ≤ 2000 chars; audit on create | ✅ |
| Worker | `agent_workflows` consumer: tool loop, 10-iteration cap, 60k-token budget, role re-check at run time | ✅ |
| AI | `@docuflow/ai` tool calling (`tools`, `toolCalls`, assistant tool-call messages) | ✅ |
| Tools | `searchDocuments`, `readDocument` (fenced untrusted content), `updateDocumentMetadata` (size limits + audit) | ✅ |
| Frontend | Dashboard "AI Agent" tab: create form, history, live polling, result/error detail, viewer read-only | ✅ |
| Frontend journey | Session auto-refresh on 401, cross-tab session sync, working uploads, XSS-safe search highlights | ✅ |
| Unit tests | Refresh-token issue/rotate/reject (10 total in `auth.service.spec.ts`) | ✅ |
| Integration | `test/agent.integration.ts` (18 tests) + regression tests in auth/documents | ✅ |
| E2E | `apps/web/e2e/journey.spec.ts`: 7 browser journeys against the real stack | ✅ |
| CI | `.github/workflows/ci.yml`: checks · integration · e2e, plus a migration guard | ✅ written, not yet run on GitHub (no remote) |
| Docs | ADR-010, PROJECT_STATE, this file | ✅ |
| Settings | OpenAI key set from the UI (verify → encrypt → use everywhere), ADR-011 | ✅ |

## Hardening pass (2026-10-01)
Edge-case deep dive across FE and BE: SQL injection, invite escalation, viewer write access, email case, 500s on
malformed input, folder rules, upload size, body-text search, races, chat error UX, pagination, cross-tab refresh.
Details in PROJECT_STATE "Recent Changes". Tests: `test/edge-cases.integration.ts`, `e2e/edge-cases.spec.ts`.

## Teams & workspace increment (2026-10-01) ✅
Org switching, live membership checks, invitation links + landing/sign-up flow, Team tab (roles, removal, leave),
folders UI (navigate, create, delete, move), retry + reindex. Design: `docs/adr/ADR-012-teams-and-org-switching.md`.
Tests: `apps/api/test/team.integration.ts`, `apps/web/e2e/team.spec.ts`, reindex journey in `e2e/ai-live.spec.ts`.

## Rate limiting (2026-10-02) ✅
Global + per-route limits per client IP, Redis-backed; `TRUST_PROXY` fixes IP spoofing. Design: `docs/adr/ADR-013-rate-limiting.md`.
Tests: `apps/api/test/rate-limit.integration.ts`, "rate limiting" journeys in `apps/web/e2e/journey.spec.ts`.

## Next
1. Push to a GitHub remote (user to create the repo) and get CI green.
2. Phase 6 extras below, or Phase 7 observability.

## Deferred to a later Phase 6 increment
- Remaining roadmap tools (`listFolders`, `createFolder`, `moveDocument`, `summarizeDocument`, `shareDocument`, `getAuditLogs`). These need a human-approval step for destructive or sharing actions.
- Streaming progress (SSE) instead of polling.
- Showing which documents a workflow changed, with links, in the UI.
- Mobile layout for the dashboard sidebar (pre-existing, affects all tabs).

## Validation
```bash
pnpm typecheck                                   # all packages + API tests
pnpm --filter @docuflow/web lint
pnpm --filter @docuflow/api test:unit
pnpm --filter @docuflow/api test:integration     # needs docker compose up
pnpm db:check-migrations
RATE_LIMIT_MULTIPLIER=20 pnpm dev                # E2E comes from one IP; relax limits (CI does the same)
cd apps/web && E2E_BASE_URL=http://localhost:3000 pnpm test:e2e   # needs pnpm dev running
cd apps/web && E2E_OPENAI_KEY=sk-... E2E_BASE_URL=http://localhost:3000 pnpm test:e2e ai-live   # opt-in, real OpenAI
```
