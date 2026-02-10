-- AlterTable
ALTER TABLE "public"."clubs" ADD COLUMN     "defaultVenueId" TEXT;

-- CreateTable
CREATE TABLE "public"."club_schedules" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_schedules_clubId_idx" ON "public"."club_schedules"("clubId");

-- AddForeignKey
ALTER TABLE "public"."clubs" ADD CONSTRAINT "clubs_defaultVenueId_fkey" FOREIGN KEY ("defaultVenueId") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_schedules" ADD CONSTRAINT "club_schedules_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
