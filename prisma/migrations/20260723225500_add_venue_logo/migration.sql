-- AlterTable
ALTER TABLE "public"."venues"
ADD COLUMN IF NOT EXISTS "logo" TEXT,
ADD COLUMN IF NOT EXISTS "logoPublicId" TEXT;
