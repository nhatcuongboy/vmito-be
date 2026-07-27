-- AlterEnum
-- Add PROFILE_COVER category for user cover photos. Enum additions are non-destructive.
ALTER TYPE "public"."ImageCategory" ADD VALUE IF NOT EXISTS 'PROFILE_COVER';
