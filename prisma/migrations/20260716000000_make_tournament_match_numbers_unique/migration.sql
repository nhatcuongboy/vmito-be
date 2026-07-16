-- Preserve existing match numbers where possible and move only duplicate
-- occurrences above the current maximum for their tournament.
WITH ranked_matches AS (
  SELECT
    cm."id",
    c."tournamentId",
    cm."matchNumber",
    ROW_NUMBER() OVER (
      PARTITION BY c."tournamentId", cm."matchNumber"
      ORDER BY c."createdAt", cm."createdAt", cm."id"
    ) AS duplicate_rank
  FROM "category_matches" cm
  INNER JOIN "categories" c ON c."id" = cm."categoryId"
),
tournament_maximums AS (
  SELECT c."tournamentId", MAX(cm."matchNumber") AS maximum_match_number
  FROM "category_matches" cm
  INNER JOIN "categories" c ON c."id" = cm."categoryId"
  GROUP BY c."tournamentId"
),
duplicate_replacements AS (
  SELECT
    ranked."id",
    maximums.maximum_match_number + ROW_NUMBER() OVER (
      PARTITION BY ranked."tournamentId"
      ORDER BY ranked."matchNumber", ranked.duplicate_rank, ranked."id"
    ) AS replacement_match_number
  FROM ranked_matches ranked
  INNER JOIN tournament_maximums maximums
    ON maximums."tournamentId" = ranked."tournamentId"
  WHERE ranked.duplicate_rank > 1
)
UPDATE "category_matches" matches
SET "matchNumber" = replacements.replacement_match_number
FROM duplicate_replacements replacements
WHERE matches."id" = replacements."id";

CREATE OR REPLACE FUNCTION enforce_tournament_match_number_uniqueness()
RETURNS TRIGGER AS $$
DECLARE
  tournament_id TEXT;
BEGIN
  SELECT "tournamentId" INTO tournament_id
  FROM "categories"
  WHERE "id" = NEW."categoryId";

  -- Serialize number allocation within a tournament so concurrent inserts
  -- cannot both pass the duplicate check.
  PERFORM pg_advisory_xact_lock(hashtextextended(tournament_id, 0));

  IF EXISTS (
    SELECT 1
    FROM "category_matches" existing_match
    INNER JOIN "categories" existing_category
      ON existing_category."id" = existing_match."categoryId"
    WHERE existing_category."tournamentId" = tournament_id
      AND existing_match."matchNumber" = NEW."matchNumber"
      AND existing_match."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'Match number % already exists in tournament %',
      NEW."matchNumber", tournament_id
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER category_matches_tournament_match_number_unique
BEFORE INSERT OR UPDATE OF "categoryId", "matchNumber"
ON "category_matches"
FOR EACH ROW
EXECUTE FUNCTION enforce_tournament_match_number_uniqueness();