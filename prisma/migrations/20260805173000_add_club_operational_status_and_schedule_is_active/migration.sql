-- CreateEnum
CREATE TYPE "ClubOperationalStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISSOLVED');

-- AlterTable: Add operationalStatus to clubs
ALTER TABLE "clubs" ADD COLUMN "operationalStatus" "ClubOperationalStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable: Add isActive to club_schedules
ALTER TABLE "club_schedules" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "club_schedules_clubId_isActive_idx" ON "club_schedules"("clubId", "isActive");
