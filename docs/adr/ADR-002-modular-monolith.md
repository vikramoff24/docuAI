# ADR-002: Modular Monolith Architecture

**Status:** Accepted  
**Date:** 2026-09-26

---

## Context

We need to decide the high-level architectural style for the backend: microservices, modular monolith, or classic monolith.

---

## Decision

Start with a **modular monolith** using NestJS modules as the unit of modularity.

---

## What is a Modular Monolith?

A modular monolith is a single deployable application internally organized into distinct modules with clear interfaces. It is NOT a "big ball of mud" — it has enforced module boundaries.

```
NestJS Application
├── AuthModule        (authentication, JWT)
├── UsersModule       (user profile management)
├── OrgsModule        (organization management)
├── MembersModule     (org membership, roles)
├── DocumentsModule   (CRUD, storage)
├── FoldersModule     (hierarchy)
├── SearchModule      (full-text + vector)
├── AIModule          (summaries, Q&A)
├── AgentModule       (AI agent with tools)
└── AuditModule       (audit logging)
```

Each module:
- Has its own controllers, services, and DTOs
- Does NOT directly access another module's database tables via raw SQL
- Imports other modules through NestJS's dependency injection system
- Communicates via typed service interfaces, not arbitrary coupling

---

## Alternatives Considered

### Option A: Microservices from day one

**Would require:**
- Kubernetes or ECS
- Service discovery
- API gateway
- Inter-service authentication
- Distributed tracing
- Saga pattern for cross-service transactions
- Contract testing between services
- Network failure handling between every service call

**Reality for a new product:**
- 90% of the engineering effort goes to distributed systems plumbing
- 10% goes to actual business features
- Most startups that start with microservices either fail to ship or spend years simplifying back to a monolith
- Even Netflix, Amazon, and Uber started as monoliths

**When to actually choose microservices:**
- You have separate teams that need to deploy independently
- You have services with radically different scaling characteristics (e.g., search needs 10x the compute of everything else)
- You have well-understood domain boundaries after running the product for years

### Option B: Classic Monolith (no module boundaries)
Services import each other arbitrarily, no enforced interface contracts.

**Cons:** Becomes unmaintainable quickly. Impossible to extract later.

### Option C: Modular Monolith ← CHOSEN

**Pros:**
- Single deployment unit (simple ops)
- Simple database transactions (Postgres ACID across modules)
- Fast development velocity
- Clear NestJS module boundaries enforce encapsulation
- Extractable to microservices later if needed
- Shared type system (no serialization between services)

---

## Consequences

- Each NestJS module is a bounded context
- Cross-module communication happens through NestJS providers (DI), never through DB joins across module boundaries from different services
- We use NestJS's `EventEmitter` or BullMQ for async cross-module events (e.g., document created → trigger processing)
- If we later need to extract `SearchModule` to a separate service, the interface is already clean

---

## Migration Path (if ever needed)

```
Modular Monolith
     ↓ (when search needs 50x more compute than everything else)
Extract SearchService to a separate service
     ↓ (when AI usage is 1000x auth usage)
Extract AIService
     ↓
Microservices (only for what's justified)
```
