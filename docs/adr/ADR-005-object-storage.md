# ADR-005: S3-Compatible Object Storage with Presigned URLs

**Status:** Accepted  
**Date:** 2026-09-26

---

## Decision

Use **AWS S3** (production) / **LocalStack** (local dev) for document storage.
Use **presigned URLs** for all uploads and downloads — clients never talk to the API to transfer file bytes.

---

## Upload Architecture

```
Client
  │
  ▼  POST /documents (create record + request upload URL)
API
  │  Generates presigned PUT URL (valid 15 minutes)
  ▼  Returns { documentId, uploadUrl }
Client
  │
  ▼  PUT <presigned S3 URL> (file bytes go directly to S3)
S3
  │
  ▼  Client calls POST /documents/:id/confirm
API
  │  Updates status, enqueues processing job
  ▼  Returns document metadata
```

## Why Presigned URLs?

**Alternative:** Proxy file bytes through the API server
- API receives multipart upload
- API writes to S3
- **Problem:** API servers are expensive compute. Routing terabytes of file bytes through them is wasteful and creates a bottleneck.

**Presigned URLs:**
- Client uploads directly to S3 (bypasses API)
- API only handles metadata (fast, lightweight)
- S3 handles bandwidth, availability, and storage
- URL is time-limited and signed (cannot be abused)
- Standard pattern at companies like Dropbox, Notion, Linear

---

## Storage Organization

```
s3://docuflow-{env}/
├── organizations/
│   └── {orgId}/
│       └── documents/
│           └── {docId}/{filename}
└── thumbnails/
    └── {docId}/thumbnail.webp
```

---

## Consequences

- LocalStack in docker-compose mimics S3 API locally
- `packages/storage` provides a `StorageService` interface
- Signed URL generation is handled server-side (secret never exposed to client)
- Document deletion is soft-delete in DB; S3 objects cleaned up by a lifecycle policy or worker
