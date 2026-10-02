/*
  Warnings:

  - You are about to drop the column `embedding` on the `document_chunks` table. All the data in the column will be lost.
  - You are about to drop the column `searchVector` on the `documents` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- DropIndex
DROP INDEX "document_chunks_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "documents_name_trgm_idx";

-- DropIndex
DROP INDEX "documents_search_vector_gin_idx";

-- DropIndex
DROP INDEX "documents_tags_gin_idx";

-- AlterTable
ALTER TABLE "document_chunks" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "searchVector";

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflows_organizationId_idx" ON "workflows"("organizationId");

-- CreateIndex
CREATE INDEX "workflows_organizationId_status_idx" ON "workflows"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
