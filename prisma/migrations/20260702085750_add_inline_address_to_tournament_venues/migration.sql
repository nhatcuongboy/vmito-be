-- Migration: add inline address fields to tournament_venues
-- Allows tournament venues to store a Google Maps address directly
-- without creating a record in the venues table (venue_id becomes nullable).

-- 1. Make "venueId" nullable (existing records already have a value → safe)
ALTER TABLE "tournament_venues" ALTER COLUMN "venueId" DROP NOT NULL;

-- 2. Drop the old unique index on (tournamentId, venueId)
--    It breaks inline records that share a NULL venueId.
DROP INDEX IF EXISTS "tournament_venues_tournamentId_venueId_key";

-- 3. Add inline address columns (all nullable — existing rows get NULL, which is correct)
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "name"     TEXT;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "acronym"  TEXT;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "placeId"  TEXT;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "address"  TEXT;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "lat"      DOUBLE PRECISION;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "lng"      DOUBLE PRECISION;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "tournament_venues" ADD COLUMN IF NOT EXISTS "city"     TEXT;
