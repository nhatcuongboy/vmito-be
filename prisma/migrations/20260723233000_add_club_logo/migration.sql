-- AlterTable
ALTER TABLE "public"."clubs"
ADD COLUMN IF NOT EXISTS "logo" TEXT,
ADD COLUMN IF NOT EXISTS "logoPublicId" TEXT;
