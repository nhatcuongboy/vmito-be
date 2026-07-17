-- AlterEnum
-- Add price/image correction request types. Enum additions are non-destructive.
ALTER TYPE "VenueRequestType" ADD VALUE IF NOT EXISTS 'PRICE_CORRECTION';
ALTER TYPE "VenueRequestType" ADD VALUE IF NOT EXISTS 'IMAGE_CORRECTION';
