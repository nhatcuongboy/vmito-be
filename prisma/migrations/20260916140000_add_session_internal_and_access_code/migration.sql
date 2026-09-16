-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN "accessCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_accessCode_key" ON "sessions"("accessCode");

-- CreateIndex
CREATE INDEX "sessions_isInternal_idx" ON "sessions"("isInternal");
