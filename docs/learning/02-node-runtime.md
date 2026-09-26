# Learning 02 — Node.js Runtime

*Understanding what actually happens inside Node.js when your NestJS code runs.*

---

## Node.js is NOT a language

Node.js is a **runtime environment** for JavaScript. It takes the V8 JavaScript engine (same engine inside Chrome) and adds:
- File system access (`fs`)
- Network access (`net`, `http`, `https`)
- Process management (`process`)
- Worker threads (`worker_threads`)
- Stream processing
- The **event loop** (via libuv)

---

## The Event Loop (most important concept)

JavaScript is single-threaded. The event loop is how Node.js handles concurrency without threads.

```
┌─────────────────────────────────┐
│           Event Loop            │
│                                 │
│  ┌──────────┐  ┌─────────────┐ │
│  │  timers  │  │ I/O callbacks│ │
│  └──────────┘  └─────────────┘ │
│  ┌──────────┐  ┌─────────────┐ │
│  │  poll    │  │    check    │ │
│  │(I/O wait)│  │(setImmediate)││
│  └──────────┘  └─────────────┘ │
│  ┌──────────────────────────┐  │
│  │       close callbacks    │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

**The key insight:** When you `await prisma.document.findMany(...)`, Node.js does NOT sit and wait. It:
1. Registers a callback for when the database responds
2. Continues processing other requests
3. When the DB response arrives (via libuv network I/O), the callback fires
4. Your `await` resumes from where it left off

This is why Node.js can serve thousands of concurrent requests on a single thread.

---

## What Blocks the Event Loop

```typescript
// ✅ Non-blocking: awaits the DB, event loop is free during wait
async getDocuments(orgId: string) {
  return await this.prisma.document.findMany({ where: { organizationId: orgId } });
}

// ❌ BLOCKING: CPU-intensive synchronous work on the main thread
function extractTextFromPdf(buffer: Buffer): string {
  // If this takes 2 seconds, ALL requests are frozen for 2 seconds
  return pdfParse(buffer);  // Synchronous parsing blocks the event loop
}

// ✅ Non-blocking: offload to worker thread
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  return await runInWorkerThread(() => pdfParse(buffer));
}
```

**DocuFlow AI consequence:** PDF text extraction happens in `apps/worker` (a separate process), not in `apps/api`. This keeps the API event loop free.

---

## async/await is Syntactic Sugar

```typescript
// What you write:
const doc = await this.prisma.document.findFirst({ where: { id } });

// What V8 actually does (simplified):
this.prisma.document.findFirst({ where: { id } })
  .then((doc) => {
    // everything after the await runs here
    return doc;
  });
```

`async/await` makes asynchronous code look synchronous. The event loop still runs while you're "awaited".

---

## V8 and Memory

V8 compiles JavaScript to machine code using **Just-In-Time (JIT) compilation**. This is why "warm" Node.js processes are fast — V8 has had time to optimize hot code paths.

Memory management:
- V8 has a garbage collector (GC)
- GC pauses ("stop-the-world") can cause latency spikes under high load
- Default heap size is ~1.5GB on 64-bit systems
- Set `--max-old-space-size=4096` for memory-intensive workers

---

## Node.js + NestJS Performance Characteristics

| Workload | Node.js Performance |
|---|---|
| Many concurrent small requests (API) | ✅ Excellent |
| I/O intensive (DB, file, network) | ✅ Excellent |
| CPU-intensive (PDF parsing, compression) | ❌ Poor (use worker threads or separate process) |
| Streaming large files | ✅ Good (with proper stream handling) |
| WebSockets (many idle connections) | ✅ Excellent |

---

## Process Architecture in DocuFlow AI

```
apps/api (main process)
  ├── Event loop handles HTTP requests
  ├── Async DB queries (non-blocking)
  ├── Enqueues BullMQ jobs (non-blocking Redis write)
  └── Never does CPU-intensive work

apps/worker (separate process)
  ├── BullMQ worker consumes jobs
  ├── PDF parsing (CPU-intensive, isolated)
  ├── Embedding API calls (I/O, non-blocking)
  └── Prisma writes (non-blocking)
```

By separating the worker, a slow PDF parse doesn't freeze API response times.

---

## Environment Variables in Node.js

Node.js reads environment variables from `process.env`:
```typescript
const DB_URL = process.env.DATABASE_URL;
```

In NestJS, we use `@nestjs/config` which wraps this with:
- Validation (required variables)
- Type casting
- `.env` file loading (development)
- Secrets from environment (production)

**Never hardcode secrets.** Never commit `.env` files. Always use environment variables.

---

## Memory Leak Patterns in Node.js

Common sources in a NestJS app:
1. **Event emitter listeners not removed** — `EventEmitter.on()` without corresponding `off()`
2. **Closures capturing large objects** — Timers/intervals holding references
3. **Prisma connection pool exhaustion** — Not properly closing connections
4. **BullMQ jobs accumulating** — Failed jobs not being cleaned

We address these with:
- `OnModuleDestroy` lifecycle hooks to close connections
- BullMQ job cleanup policies
- Memory monitoring in observability stack
