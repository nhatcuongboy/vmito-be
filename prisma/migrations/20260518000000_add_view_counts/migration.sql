-- CreateEnum
CREATE TYPE "ViewTargetType" AS ENUM ('VENUE', 'CLUB', 'SESSION');

-- CreateTable
CREATE TABLE "view_counts" (
    "id" TEXT NOT NULL,
    "targetType" "ViewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "view_counts_targetType_targetId_key" ON "view_counts"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "view_counts_targetType_idx" ON "view_counts"("targetType");

-- CreateIndex
CREATE INDEX "view_counts_targetId_idx" ON "view_counts"("targetId");
