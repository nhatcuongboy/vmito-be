-- AlterTable
ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "coverPhoto" TEXT,
ADD COLUMN IF NOT EXISTS "coverPhotoPublicId" TEXT;
