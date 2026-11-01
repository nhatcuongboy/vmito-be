-- Multi-segment rentals: one request may book different time ranges on
-- different courts of the same day. Additive only; single-range quotes and
-- requests keep these NULL.

-- AlterTable
ALTER TABLE "venue_rental_quotes" ADD COLUMN "segments" JSONB;

-- AlterTable
ALTER TABLE "venue_rental_requests" ADD COLUMN "confirmedSegments" JSONB;
