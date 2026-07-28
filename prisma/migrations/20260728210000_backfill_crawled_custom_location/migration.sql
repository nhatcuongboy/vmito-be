-- Data-only backfill for crawled ("kèo vãng lai") sessions imported before the
-- crawler started writing a custom-location snapshot. Those rows have no
-- venueId and only the legacy free-form `location` string, so the location UI
-- has nothing structured to render.
--
-- Copy `location` into customLocationName and stop there: the legacy string is
-- a display blob ("Sân ABC, Quận 7") with no reliable separator, and splitting
-- it back into name/address/district would invent structure that is wrong more
-- often than it is right. Address and area stay NULL until a human edits them.
--
-- Idempotent: guarded on customLocationName IS NULL, so re-running is a no-op
-- and it never overwrites a snapshot written by the ingest path.
UPDATE "sessions"
SET "customLocationName" = BTRIM("location")
WHERE "isCrawled" = TRUE
  AND "venueId" IS NULL
  AND "customLocationName" IS NULL
  AND "location" IS NOT NULL
  AND BTRIM("location") <> '';
