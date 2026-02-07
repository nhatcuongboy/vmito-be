-- CreateEnum
CREATE TYPE "public"."VenueStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "public"."venues" ADD COLUMN     "hourlyRateFixed" INTEGER,
ADD COLUMN     "hourlyRateWalkIn" INTEGER,
ADD COLUMN     "numberOfCourts" INTEGER,
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "public"."VenueStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "venues_status_idx" ON "public"."venues"("status");

-- CreateIndex
CREATE INDEX "venues_city_idx" ON "public"."venues"("city");

-- CreateIndex
CREATE INDEX "venues_district_idx" ON "public"."venues"("district");

-- CreateIndex
CREATE INDEX "venues_lat_lng_idx" ON "public"."venues"("lat", "lng");
