# ADR-011: Organization AI Credentials (OpenAI key set in the UI)

**Status:** Accepted  
**Date:** 2026-10-01

---

## Decision

Organization admins can store their own **OpenAI API key** from **Dashboard → Settings**. Every AI feature resolves its key per organization:

```
organization key (Settings)  →  server OPENAI_API_KEY  →  not configured (503 / fallback)
```

| Feature | Where the key is resolved |
|---|---|
| AI chat (RAG), document summaries | `RAGService` → `AiCredentialsService.providerFor(orgId)` |
| Semantic / hybrid search | `SearchService` → `resolveOpenAIKey(orgId)` (falls back to fulltext) |
| Document embeddings (worker) | `DocumentProcessingService.generateEmbeddings(…, orgId)` |
| AI agent workflows (worker) | `AgentWorkflowsConsumer` → `WorkerAiCredentialsService.providerFor(orgId)` |

## API

| Method | Route | Role | Notes |
|---|---|---|---|
| GET | `/settings/ai` | any member | `{ configured, source, last4, updatedAt, updatedBy, canStoreKeys }` |
| PUT | `/settings/ai/openai-key` | ADMIN+ | Checks the shape (`sk-…`) → verifies with OpenAI (`GET /v1/models`) → stores. 422 if malformed or rejected, 502 if OpenAI is unreachable |
| DELETE | `/settings/ai/openai-key` | ADMIN+ | Idempotent, 204 |

## Security

- **Write-only secret:** the key is never returned, logged or audited. Clients only ever see `last4`.
- **Encryption at rest:** AES-256-GCM with a random IV per write, and the **organization id as AAD**. A ciphertext copied into another organization's row fails to decrypt. Format: `v1:<iv>:<tag>:<ciphertext>`.
- **Server key:** `AI_CREDENTIALS_ENCRYPTION_KEY` (32 bytes, base64 or hex), which **must be identical for the API and the worker**. Outside production there's a fixed development fallback. In production, if it's unset, storing keys is disabled (`canStoreKeys: false`, PUT → 503) rather than using a guessable key.
- **Verified before storing:** a key OpenAI rejects is never saved, so users get immediate feedback instead of a later failure inside a workflow.
- **Audit:** `ORG_UPDATED` with `{ setting: 'ai.openai_api_key', change: 'set' | 'removed', last4 }`.
- **Undecryptable keys:** a stored key that can't be decrypted (e.g. the server key was rotated) is logged and skipped, and resolution falls back to the server key.

## Consequences / follow-ups

- Documents uploaded before a key existed have no embeddings, so semantic search skips them until they're reprocessed. A "re-embed documents" action is a follow-up.
- Rotating `AI_CREDENTIALS_ENCRYPTION_KEY` means admins have to re-enter their keys. Key versioning (`v2:` payloads) is the path to live rotation.
- Only OpenAI is supported for now. The `provider` column allows others later (see ADR-008).
