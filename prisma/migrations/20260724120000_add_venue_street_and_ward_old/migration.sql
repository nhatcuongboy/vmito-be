-- Additive, nullable columns: house-number/street (shared by old and new
-- address composition) and the old ward, both extracted from the existing
-- free-text `address` column. Backfilled by scripts/backfill-street-and-new-address.ts.
ALTER TABLE "venues" ADD COLUMN "streetAddress" TEXT;
ALTER TABLE "venues" ADD COLUMN "wardOld" TEXT;
