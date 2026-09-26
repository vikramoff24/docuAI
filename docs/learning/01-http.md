# Learning 01 — HTTP: The Protocol Powering Every API

*This document is grounded in DocuFlow AI's actual implementation.*

---

## What is HTTP?

HTTP (HyperText Transfer Protocol) is a **request-response protocol** over TCP. Every API call in DocuFlow AI is an HTTP request. Understanding HTTP deeply means understanding what actually happens when you call `fetch('/api/documents')`.

---

## The Full Request Journey

```
Your Browser
    │
    ▼  DNS lookup: "api.docuflow.app" → IP address
    │
    ▼  TCP handshake (3 packets: SYN → SYN-ACK → ACK)
    │
    ▼  TLS handshake (asymmetric key exchange → symmetric session key)
    │    (This is why HTTPS has higher latency than HTTP — ~150ms extra round trips)
    │
    ▼  HTTP/1.1 or HTTP/2 or HTTP/3
    │
    ▼  Load Balancer (AWS ALB, nginx)
    │    Terminates TLS, forwards to one of N API instances
    │
    ▼  Node.js (Fastify HTTP server)
    │    Parses bytes into request object
    │
    ▼  NestJS routing → finds the matching controller method
    │
    ▼  Your handler runs
    │
    ▼  Response travels back the same path
```

---

## HTTP Methods and Their Semantics

In DocuFlow AI, we strictly follow REST semantics:

| Method | Semantic | DocuFlow Example |
|---|---|---|
| GET | Retrieve (idempotent, safe) | `GET /documents/:id` |
| POST | Create or non-idempotent action | `POST /documents`, `POST /auth/login` |
| PUT | Full replacement | `PUT /folders/:id` |
| PATCH | Partial update | `PATCH /documents/:id` |
| DELETE | Remove | `DELETE /documents/:id` |

**Idempotent** means: calling the operation multiple times has the same result as calling it once. GET, PUT, DELETE are idempotent. POST is not (creating 10 times = 10 documents).

---

## HTTP Status Codes We Use

```
2xx Success
  200 OK                    — Response has body
  201 Created               — POST that created a resource
  202 Accepted              — Async job queued (document upload confirmed)
  204 No Content            — DELETE success (no body)

3xx Redirect
  301 Moved Permanently     — Domain change
  302 Found                 — Temporary redirect

4xx Client Errors
  400 Bad Request           — Validation failed
  401 Unauthorized          — No/invalid JWT
  403 Forbidden             — Valid JWT, but insufficient permissions
  404 Not Found             — Resource doesn't exist (or cross-tenant hidden)
  409 Conflict              — Duplicate email on registration
  422 Unprocessable Entity  — Business logic validation failure
  429 Too Many Requests     — Rate limiting

5xx Server Errors
  500 Internal Server Error — Unhandled exception
  502 Bad Gateway           — Upstream service failed
  503 Service Unavailable   — Server overloaded/maintenance
  504 Gateway Timeout       — Upstream timed out
```

**Key security note on 404 vs 403:** When tenant B tries to access tenant A's document, we return 404, not 403. Returning 403 reveals that the resource exists — 404 reveals nothing.

---

## HTTP Headers That Matter

```
Request Headers:
  Authorization: Bearer <jwt>           ← Our auth mechanism
  Content-Type: application/json        ← Body format
  Accept: application/json              ← Expected response format
  X-Request-ID: abc-123                 ← Distributed tracing (we inject this)
  X-Organization-ID: org-uuid          ← Redundant with JWT, for debugging

Response Headers:
  Content-Type: application/json
  X-Request-ID: abc-123                 ← Echo back for correlation
  X-RateLimit-Remaining: 95            ← How many requests left
  Cache-Control: no-store               ← Don't cache auth responses
  Strict-Transport-Security: max-age=31536000  ← HSTS (HTTPS only)
```

---

## HTTP/1.1 vs HTTP/2 vs HTTP/3

| Feature | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Multiplexing | ❌ (one request per connection) | ✅ | ✅ |
| Header compression | ❌ | ✅ HPACK | ✅ QPACK |
| Transport | TCP | TCP | UDP (QUIC) |
| Server Push | ❌ | ✅ | ✅ |
| Head-of-line blocking | Yes (TCP) | Yes (TCP level) | ❌ (QUIC per-stream) |

**In DocuFlow AI:** We use Fastify with HTTP/2 support. The load balancer (nginx/ALB) handles TLS and upgrades connections to HTTP/2 where supported.

---

## What Node.js Does with HTTP

Node.js is single-threaded but uses an **event loop** to handle many concurrent connections:

```
HTTP Request arrives
    │
    ▼  libuv (C++ layer) receives bytes on the TCP socket
    │
    ▼  Emits 'data' event to Node.js
    │
    ▼  http.IncomingMessage is constructed
    │
    ▼  Fastify routes to handler
    │
    ▼  If handler is async (always in NestJS), the async operation is
    │   awaited — Node.js event loop is NOT blocked
    │
    ▼  When the awaited operation completes (DB query, etc.)
    │   the event loop callback fires and continues execution
    │
    ▼  Response is sent back via TCP
```

**This is why Node.js can handle 10,000 concurrent connections with a single thread** — I/O is non-blocking. The event loop switches between requests while each one waits for I/O.

**This is also why CPU-intensive work (e.g., parsing a 100MB PDF) blocks everything** — it runs synchronously on the single thread. For that, we use a Worker thread or a separate process.

---

## 🧠 Learning Checkpoint

*Think about this, then read on:*

> **Why does DocuFlow AI return a presigned S3 URL for uploads instead of accepting the file bytes in the API POST request?**

*Take a moment to reason about this from an HTTP perspective...*

**Answer:** Because uploading a 500MB PDF via the API would:
1. Tie up a Node.js HTTP connection for minutes (blocking the event loop if not streamed)
2. Route 500MB through the API server's network bandwidth unnecessarily
3. Fail at load balancer timeouts (most ALBs have 60s idle timeout)
4. Provide no retry capability

With presigned URLs, the client uploads directly to S3 (designed for massive file bandwidth), the API handles only lightweight metadata operations, and the upload can be retried client-side without touching the API.
