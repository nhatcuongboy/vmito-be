-- AlterTable: mark which tournament venue is the main location
ALTER TABLE "tournament_venues" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tournament_venues_tournamentId_isPrimary_idx" ON "tournament_venues"("tournamentId", "isPrimary");

-- Backfill: the row matching the tournament's denormalized venueId pointer.
UPDATE "tournament_venues" tv
SET "isPrimary" = true
FROM "tournaments" t
WHERE tv."tournamentId" = t."id"
  AND t."venueId" IS NOT NULL
  AND tv."venueId" = t."venueId";

-- Backfill: tournaments with no pointer fall back to their oldest venue,
-- which is what the public pages already displayed as the main location.
UPDATE "tournament_venues" tv
SET "isPrimary" = true
FROM (
  SELECT DISTINCT ON ("tournamentId") "id"
  FROM "tournament_venues"
  WHERE "tournamentId" NOT IN (
    SELECT "tournamentId" FROM "tournament_venues" WHERE "isPrimary" = true
  )
  ORDER BY "tournamentId", "createdAt" ASC
) oldest
WHERE tv."id" = oldest."id";
