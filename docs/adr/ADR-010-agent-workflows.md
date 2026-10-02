# ADR-010: AI Agent Workflows

**Status:** Accepted  
**Date:** 2026-10-01

---

## Decision

Run the AI agent as an **asynchronous workflow**: the API persists a `Workflow` row and enqueues a job on the `agent_workflows` BullMQ queue, and the worker runs a bounded tool-calling loop against the database. The browser polls `GET /workflows` until each run reaches a terminal state.

```
Browser ──POST /workflows──▶ API ──insert (PENDING)──▶ Postgres
                              └──enqueue──▶ Redis (agent_workflows)
Worker ◀──job── Redis
  ├─ RUNNING
  ├─ loop: LLM ⇄ tools (searchDocuments / readDocument / updateDocumentMetadata)
  └─ COMPLETED (output) | FAILED (error)
Browser ──poll GET /workflows every 2s while PENDING/RUNNING──▶ API
```

## Why async (not a synchronous or SSE endpoint)

- Agent runs take several LLM round-trips, often tens of seconds. That's too long to hold an HTTP request open.
- The worker already owns long-running jobs (ADR-006), and it has its own DB pool and failure handling.
- Polling is simple and reliable. SSE (as used for chat) could replace it later without changing the data model.

## Safety controls

| Risk | Control | Where |
|---|---|---|
| Cross-tenant access | Every tool query is scoped by the job's `organizationId`, which the worker binds; it never comes from LLM arguments. The job's org must also match the workflow row. | `agent-tools.ts`, consumer |
| Privilege escalation | `POST /workflows` requires MEMBER+. The creator's role is re-checked when the job **executes**, so a user downgraded to VIEWER after queueing can't write. | controller, consumer |
| Prompt injection | Document text is returned inside `<untrusted_document_content>` delimiters (look-alike tags are stripped). The system prompt says tool output is data, never instructions. Writes are limited to metadata and tags, so there's no delete or share tool. | `agent-tools.ts`, consumer |
| Runaway loops / cost | Max 10 iterations, max 60k tokens per run, and a single attempt (no automatic retry, because a retry could apply metadata writes twice). | consumer, `AgentService` |
| Oversized writes | Metadata patch ≤ 20 keys / 4 KB; ≤ 20 tags of ≤ 50 chars; instructions ≤ 2000 chars; input ≤ 4 KB. | tools, DTO, service |
| Auditability | `AI_AGENT_ACTION` audit rows for workflow creation and every metadata update, including before/after state. Each update is written in the same transaction as its audit row. | service, tools |

Delimiting untrusted content reduces prompt injection but doesn't eliminate it. The real guarantee is the restricted tool surface: even a fully manipulated agent can only edit metadata and tags on its own organization's documents, and every change is audited.

## Consequences

- **No OpenAI key:** runs fail immediately with a clear message. The UI shows it, and E2E tests treat it as a valid terminal state.
- **Migrations:** Prisma can't model the pgvector HNSW index or the search trigger. `prisma migrate dev` keeps proposing to drop them, which is what happened in `20260930171236_add_agent_workflows` (repaired by `20261001090000_restore_search_columns`). The rule now is to generate migrations with `prisma migrate dev --create-only` and delete those statements. `pnpm db:check-migrations` (run in CI) fails the build if a migration drops a protected object without recreating it.

## Deferred (roadmap Phase 6 extras)

These tools are deferred: `listFolders`, `createFolder`, `moveDocument`, `summarizeDocument`, `shareDocument`, `getAuditLogs`. Each one widens what a manipulated agent could do, so each needs its own authorization and approval design. `moveDocument` and `shareDocument` in particular should need human confirmation.
