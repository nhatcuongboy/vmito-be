-- AlterTable: add slug column with a temporary default
ALTER TABLE "tournaments" ADD COLUMN "slug" TEXT;

-- Backfill existing rows: generate slug from id
UPDATE "tournaments" SET "slug" = "id" WHERE "slug" IS NULL;

-- Make the column required
ALTER TABLE "tournaments" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");
