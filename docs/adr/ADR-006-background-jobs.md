# ADR-006: BullMQ + Redis for Background Jobs

**Status:** Accepted  
**Date:** 2026-09-26

---

## Decision

Use **BullMQ** (Redis-backed) for all background job processing.

---

## Why Async Processing for Documents?

When a user uploads a document, the following work must happen before the document is searchable:

1. Download from S3
2. Extract text (PDF: pdf-parse, DOCX: mammoth, etc.)
3. Split into chunks (≈200-500 tokens each)
4. Generate embeddings (AI API call per chunk — 100 chunks = 100 API calls)
5. Store chunks + vectors in PostgreSQL

For a 50-page PDF, this can take **30-120 seconds**.

**You MUST NOT block an HTTP request for 30-120 seconds.** Reasons:
- HTTP timeout (client gives up after 30s by default)
- Ties up a server thread/connection
- Poor user experience
- No retry capability if it fails

**Solution:** Return `202 Accepted` immediately, process in background.

---

## Queue Architecture

```
Redis
├── Queue: document-processing
│   ├── Jobs: { documentId, orgId, storageKey }
│   └── Config: 3 retries, exponential backoff, 30s timeout per attempt
├── Queue: email-notifications
│   ├── Jobs: { type, userId, data }
│   └── Config: 5 retries, 1h delay on failure
└── Queue: ai-summarization
    ├── Jobs: { documentId, orgId, userId }
    └── Config: 2 retries, 2min timeout
```

---

## Why BullMQ over alternatives?

| | BullMQ | pg-boss | Temporal | SQS |
|---|---|---|---|---|
| Language | Node.js native | Node.js | Multi-lang | Any |
| Backend | Redis | PostgreSQL | Temporal server | AWS |
| Complexity | Low | Low | High | Medium |
| Visibility | Bull Board UI | SQL queries | Temporal UI | CloudWatch |
| Exactly-once | No (at-least-once) | Yes | Yes | No |
| Local dev | Easy | Easy | Complex | Needs LocalStack |

**BullMQ wins** for simplicity + Redis (which we already have for caching).

**pg-boss** would be a good choice if we didn't want to run Redis, but Redis is already needed for token revocation and rate limiting.

**Temporal** is powerful but operationally complex — justified only for very long-running workflows or complex saga patterns.

---

## Idempotency

Jobs can be retried. Workers must be idempotent:
- Check if document is already in `READY` status before processing
- Use upsert (not insert) for chunks
- S3 downloads are idempotent (same key = same file)

---

## Consequences

- `apps/worker` is a separate NestJS process consuming BullMQ queues
- Worker shares `packages/database` (same Prisma schema)
- Bull Board UI available at `/admin/queues` in development
- Redis is required infrastructure (Docker Compose + cloud Redis in prod)
