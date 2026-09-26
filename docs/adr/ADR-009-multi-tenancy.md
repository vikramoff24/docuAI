# ADR-009: Application-Level Multi-Tenancy

**Status:** Accepted  
**Date:** 2026-09-26

---

## Decision

Use **application-level multi-tenancy**: single database, single schema, `organizationId` foreign key on every tenant-owned resource.

---

## Multi-Tenancy Models Compared

### Model 1: Database per tenant
```
tenant-a.docuflow.app → database: docuflow_tenant_a
tenant-b.docuflow.app → database: docuflow_tenant_b
```
**Pros:** Perfect isolation, can take per-tenant backups
**Cons:** Operational nightmare (1000 tenants = 1000 databases), expensive

### Model 2: Schema per tenant (PostgreSQL schemas)
```
PostgreSQL instance
├── schema: tenant_abc
│   ├── documents
│   └── folders
└── schema: tenant_xyz
    ├── documents
    └── folders
```
**Pros:** Good isolation, easier backups per tenant
**Cons:** Prisma doesn't support dynamic schema switching well, complex migrations

### Model 3: Row-level (organizationId column) ← CHOSEN
```
PostgreSQL instance
└── schema: public
    ├── documents (organizationId column)
    ├── folders   (organizationId column)
    └── audit_logs (organizationId column)
```
**Pros:** Simple, Prisma handles it naturally, easy to reason about
**Cons:** Isolation is application-enforced (not DB-enforced)

---

## Why Model 3

- We are pre-PMF, complexity is the enemy
- Prisma makes it easy to always include `organizationId` in queries
- We compensate for weaker isolation with defense-in-depth

---

## Defense in Depth

**Layer 1: JWT contains organizationId**
- Access token includes the organization context
- Cannot be spoofed without the private key

**Layer 2: Service layer always receives organizationId**
- Services never accept organizationId from request body (user-controlled)
- organizationId always comes from `req.user.organizationId` (JWT-derived)

**Layer 3: Prisma queries always include organizationId**
```typescript
// CORRECT ✅
async getDocument(id: string, organizationId: string) {
  return this.prisma.document.findFirst({
    where: { id, organizationId }  // tenant-scoped
  });
}

// WRONG ❌ — Never do this
async getDocument(id: string) {
  return this.prisma.document.findUnique({ where: { id } });
}
```

**Layer 4: Integration tests verify cross-tenant access is blocked**
```typescript
it('should not allow tenant B to access tenant A documents', async () => {
  const docFromTenantA = await createDocument(tenantA);
  const tokenForTenantB = await loginAs(tenantBUser);

  const response = await request(app)
    .get(`/documents/${docFromTenantA.id}`)
    .set('Authorization', `Bearer ${tokenForTenantB}`);

  expect(response.status).toBe(404);  // Not 403 — don't reveal existence
});
```

**Why 404 not 403?**
Returning 403 "Forbidden" tells the attacker that the resource exists. Returning 404 "Not Found" reveals nothing.

---

## PostgreSQL Row-Level Security (future)

PostgreSQL has a native feature called **Row-Level Security (RLS)** that enforces tenant isolation at the database level:
```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON documents
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

We could add this as an additional defense layer in the future. For now, application-level enforcement is sufficient.

---

## Consequences

- All tenant resources have `organizationId` column with NOT NULL + FK constraint
- `@TenantId()` decorator extracts organizationId from JWT in controllers
- Services explicitly typed to always require organizationId parameter
- Integration test suite has a dedicated cross-tenant test file
