-- AlterEnum
-- Split club gallery/cover photos from the square club logo. Enum additions
-- are non-destructive.
ALTER TYPE "public"."ImageCategory" ADD VALUE IF NOT EXISTS 'CLUB_COVER';
