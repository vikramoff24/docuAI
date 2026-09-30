# Phase 1 → Phase 2 Current Tasks

## Current Phase: Phase 1 (finishing) → Phase 2 (starting)

---

## IMMEDIATE NEXT ACTION

```bash
# 1. Verify integration tests are green (jti guard fix applied)
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd /Users/vikrams/Documents/code/DocuAI
pnpm --filter @docuflow/api test:integration
# Expected: 17/17 PASS
```

If still failing: debug `JwtAuthGuard.checkBlacklist()` in `apps/api/src/auth/guards/jwt-auth.guard.ts`

---

## Phase 1 Remaining

| Task | Status | Notes |
|---|---|---|
| Integration tests — logout/cross-tenant | 🚧 FIX APPLIED | jti + manual decode, no JwtService injection |
| Org invitation API | ✅ DONE | create/list/cancel/accept in `InvitationsModule` |
| Redis token blacklisting | ✅ DONE | jti-based, `blacklist:<jti>` key in Redis |
| Refresh token rotation | ✅ DONE | full rotation with reuse detection |

---

## Phase 2 Tasks

### 2.1 Document Upload Flow
- [x] `StorageService` — presigned URLs, S3 abstraction
- [x] `DocumentsService.getUploadUrl()` — creates PENDING record + presigned PUT URL
- [x] `DocumentsService.confirmUpload()` — verifies S3 object, sets PROCESSING
- [ ] Wire BullMQ job in `confirmUpload` (needs `@InjectQueue`)
- [ ] Document integration tests

### 2.2 Document CRUD
- [x] `GET /documents` — paginated list with search/folder filter
- [x] `GET /documents/:id` — metadata
- [x] `GET /documents/:id/download` — presigned GET URL
- [x] `DELETE /documents/:id` — soft delete

### 2.3 Folder Tree
- [x] `POST /folders` — create with materialized path
- [x] `GET /folders` — list root or children
- [x] `DELETE /folders/:id` — soft delete (rejects non-empty)

### 2.4 Storage Config
- [ ] Add `storage.*` config keys to `app.config.ts` and `config.validation.ts`
- [ ] Wire StorageService to use `ConfigService` values
- [ ] LocalStack S3 smoke test

---

## Phase 2 → Phase 3 (Next)

Phase 3 is the **Document Processing Pipeline**:
1. BullMQ worker consumes `document-processing` queue jobs
2. Text extraction (PDF → text via `pdf-parse`, DOCX via `mammoth`)
3. Text chunking (512-token chunks with 50-token overlap)
4. Embedding generation (OpenAI `text-embedding-3-small`)
5. Vector storage in pgvector (`document_chunks` table)

---

## Architecture Context

### DocumentsModule Upload Flow
```
POST /documents/upload-url
  → create Document{status: PENDING} in DB
  → generate presigned S3 PUT URL (15 min TTL)
  → return { documentId, uploadUrl, storageKey, expiresIn }

Client: PUT <uploadUrl> with file binary

POST /documents/:id/confirm
  → verify S3 object exists (HeadObjectCommand)
  → set Document{status: PROCESSING}
  → queue BullMQ job: { documentId, organizationId } (TODO)
  → return { id, name, status }
```

### JwtAuthGuard Blacklist (jti-based)
```
Login → generateTokens() adds jti=uuidv4() to every JWT payload
Logout → decode jti → Redis SET blacklist:<jti> EX <remaining_ttl>
Every request → JwtAuthGuard decodes payload → GET blacklist:<jti> → 401 if found
```
No JwtService injection in guard (DI would fail across modules).
Manual base64url decode of JWT payload section is safe since passport-jwt verifies signature first.

---

## Files Changed This Session

### New Files
- `apps/api/src/redis/redis.module.ts` (previous session)
- `apps/api/src/auth/auth.service.ts` (enhanced — jti, blacklist)
- `apps/api/src/auth/guards/jwt-auth.guard.ts` (enhanced — blacklist check)
- `apps/api/src/invitations/invitations.module.ts`
- `apps/api/src/invitations/invitations.service.ts`
- `apps/api/src/invitations/invitations.controller.ts`
- `apps/api/src/invitations/dto/create-invitation.dto.ts`
- `apps/api/src/documents/documents.module.ts`
- `apps/api/src/documents/documents.service.ts`
- `apps/api/src/documents/documents.controller.ts`
- `apps/api/src/documents/storage.service.ts`
- `apps/api/src/documents/dto/create-document.dto.ts`
- `apps/api/src/documents/dto/list-documents.dto.ts`
- `apps/api/src/folders/folders.module.ts`
- `apps/api/src/folders/folders.service.ts`
- `apps/api/src/folders/folders.controller.ts`
- `apps/api/src/folders/dto/create-folder.dto.ts`

### Modified Files
- `apps/api/src/app.module.ts` (added Invitations, Documents, Folders modules)
- `apps/api/src/auth/auth.service.spec.ts` (jti assertion update)
- `apps/api/test/auth.integration.ts` (logout token scoping fix, cross-tenant fresh login fix)
