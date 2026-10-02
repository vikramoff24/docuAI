-- Per-organization AI provider keys (encrypted). Generated with --create-only;
-- Prisma's spurious DROP of document_chunks_embedding_hnsw_idx was removed (see ADR-010).

-- CreateTable
CREATE TABLE "organization_ai_credentials" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_ai_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_ai_credentials_organizationId_provider_key" ON "organization_ai_credentials"("organizationId", "provider");

-- AddForeignKey
ALTER TABLE "organization_ai_credentials" ADD CONSTRAINT "organization_ai_credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ai_credentials" ADD CONSTRAINT "organization_ai_credentials_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
