# ADR-001: Monorepo with pnpm Workspaces

**Status:** Accepted  
**Date:** 2026-09-26  
**Deciders:** Engineering team

---

## Context

DocuFlow AI consists of multiple deployable units:
- A frontend web application
- A backend API
- A background worker
- Shared libraries (database, AI, storage, types)

We need to decide how to organize these into source code repositories.

---

## Decision

Use a **monorepo** managed with **pnpm workspaces**.

---

## Alternatives Considered

### Option A: Separate Repositories (Polyrepo)
Each app/package lives in its own Git repository.

**Pros:**
- Independent deployments
- Clear ownership boundaries
- Independent CI pipelines

**Cons:**
- Sharing code requires publishing packages to npm (or a private registry)
- Cross-cutting changes (e.g., adding a field to a shared type) require PRs across multiple repos
- Local development requires linking packages manually
- Version coordination becomes complex

### Option B: Monorepo with npm workspaces or Yarn Berry

**Pros:** Similar to pnpm workspaces.

**Cons:** npm workspaces are slower; Yarn Berry has steep configuration complexity.

### Option C: Monorepo with pnpm workspaces ← CHOSEN

**Pros:**
- Fast installs (pnpm's content-addressable store)
- Strict dependency isolation (no phantom dependencies)
- Native workspace protocol (`workspace:*`)
- Cross-package TypeScript references work without publishing
- One CI pipeline, one lockfile, one git history
- Atomic commits across packages and apps

**Cons:**
- All teams work in one repo (requires good PR hygiene)
- CI pipelines need to be smart about what changed

---

## Trade-offs

| Factor | Monorepo | Polyrepo |
|---|---|---|
| Code sharing | Trivial | Requires package publishing |
| Cross-cutting changes | Single PR | Multiple PRs |
| Team autonomy | Lower | Higher |
| CI complexity | Higher (change detection) | Lower |
| Local dev experience | Excellent | Complex (linking) |

---

## Consequences

- All apps share the same `node_modules` store
- We use `pnpm --filter <package> <command>` to run commands for specific packages
- TypeScript project references give us incremental compilation
- Turborepo can be added later for build caching if build times become a problem
