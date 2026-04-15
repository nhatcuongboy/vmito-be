/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `sessions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "public"."CategoryType" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_slug_key" ON "public"."sessions"("slug");
