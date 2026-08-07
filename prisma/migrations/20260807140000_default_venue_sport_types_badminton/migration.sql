-- Legacy code paths create Venue rows directly (session location fallbacks), bypassing
-- VenuesService. Default to BADMINTON so those rows stay visible to sport filters.
ALTER TABLE "public"."venues"
ALTER COLUMN "sportTypes" SET DEFAULT ARRAY['BADMINTON']::"public"."SportType"[];

UPDATE "public"."venues"
SET "sportTypes" = ARRAY["sportType"]::"public"."SportType"[]
WHERE "sportTypes" IS NULL OR cardinality("sportTypes") = 0;
