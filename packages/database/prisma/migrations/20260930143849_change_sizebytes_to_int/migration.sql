/*
  Warnings:

  - You are about to alter the column `sizeBytes` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "sizeBytes" SET DATA TYPE INTEGER;
