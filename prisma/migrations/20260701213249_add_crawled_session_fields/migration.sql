-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "externalSource" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "isCrawled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_externalUrl_key" ON "public"."sessions"("externalUrl");

-- CreateIndex
CREATE INDEX "sessions_isCrawled_idx" ON "public"."sessions"("isCrawled");

