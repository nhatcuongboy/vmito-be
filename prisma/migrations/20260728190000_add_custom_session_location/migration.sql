ALTER TABLE "sessions"
ADD COLUMN "customLocationName" TEXT,
ADD COLUMN "customLocationAddress" TEXT,
ADD COLUMN "customLocationPlaceId" TEXT,
ADD COLUMN "customLocationLat" DOUBLE PRECISION,
ADD COLUMN "customLocationLng" DOUBLE PRECISION,
ADD COLUMN "customLocationDistrict" TEXT,
ADD COLUMN "customLocationCity" TEXT;

UPDATE "sessions"
SET "customLocationName" = BTRIM("location")
WHERE "venueId" IS NULL
  AND "location" IS NOT NULL
  AND BTRIM("location") <> '';
