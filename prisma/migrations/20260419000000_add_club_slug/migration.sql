-- AlterTable
ALTER TABLE "public"."clubs" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "public"."clubs"("slug");
