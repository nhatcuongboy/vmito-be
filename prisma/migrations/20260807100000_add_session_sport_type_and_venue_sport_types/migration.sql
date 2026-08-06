-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "sportType" "public"."SportType" NOT NULL DEFAULT 'BADMINTON';

-- AlterTable
ALTER TABLE "public"."venues" ADD COLUMN     "sportTypes" "public"."SportType"[] DEFAULT ARRAY[]::"public"."SportType"[];

-- Backfill: every existing venue supports at least its primary sport
UPDATE "public"."venues"
SET "sportTypes" = ARRAY["sportType"]::"public"."SportType"[]
WHERE "sportTypes" IS NULL OR cardinality("sportTypes") = 0;

-- Backfill: existing sessions inherit the sport of their linked venue, others stay BADMINTON
UPDATE "public"."sessions" AS s
SET "sportType" = v."sportType"
FROM "public"."venues" AS v
WHERE s."venueId" = v."id" AND v."sportType" <> 'BADMINTON';

-- CreateIndex
CREATE INDEX "sessions_sportType_idx" ON "public"."sessions"("sportType");

-- CreateIndex
CREATE INDEX "venues_sportTypes_idx" ON "public"."venues" USING GIN ("sportTypes");
