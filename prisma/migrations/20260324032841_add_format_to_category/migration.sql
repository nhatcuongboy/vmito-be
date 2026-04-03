-- CreateEnum
CREATE TYPE "public"."CategoryFormat" AS ENUM ('ROUND_ROBIN', 'SINGLE_ELIMINATION', 'ROUND_ROBIN_TO_SE');

-- AlterTable
ALTER TABLE "public"."categories" ADD COLUMN     "eliminationMatchFormat" "public"."MatchFormat",
ADD COLUMN     "format" "public"."CategoryFormat" NOT NULL DEFAULT 'ROUND_ROBIN_TO_SE',
ADD COLUMN     "formatConfig" JSONB,
ADD COLUMN     "thirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: derive format from hasGroupStage
UPDATE "public"."categories"
SET "format" = CASE
  WHEN "hasGroupStage" = true THEN 'ROUND_ROBIN_TO_SE'::"public"."CategoryFormat"
  ELSE 'SINGLE_ELIMINATION'::"public"."CategoryFormat"
END;
