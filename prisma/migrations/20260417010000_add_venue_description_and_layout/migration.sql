-- AlterTable
ALTER TABLE "venues"
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "courtLayoutImage" TEXT,
ADD COLUMN IF NOT EXISTS "courtLayoutImagePublicId" TEXT;
