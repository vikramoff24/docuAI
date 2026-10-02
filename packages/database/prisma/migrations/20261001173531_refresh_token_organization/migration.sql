-- Org switching: remember which organization a refresh-token session acts in.
-- (Prisma also generated a DROP of document_chunks_embedding_hnsw_idx here; removed — see ADR-010 / check-migrations.)

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "organizationId" UUID;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
