-- AlterTable
ALTER TABLE "public"."venues" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "public"."venues"("slug");
