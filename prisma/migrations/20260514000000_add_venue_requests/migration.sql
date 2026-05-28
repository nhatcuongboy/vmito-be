-- AlterTable
ALTER TABLE "venues" ALTER COLUMN "placeId" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "VenueRequestType" AS ENUM ('CREATE', 'UPDATE');

-- CreateEnum
CREATE TYPE "VenueRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "venue_requests" (
    "id" TEXT NOT NULL,
    "type" "VenueRequestType" NOT NULL,
    "status" "VenueRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedByUserId" TEXT NOT NULL,
    "venueId" TEXT,
    "appliedVenueId" TEXT,
    "payload" JSONB NOT NULL,
    "adminNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_requests_submittedByUserId_idx" ON "venue_requests"("submittedByUserId");

-- CreateIndex
CREATE INDEX "venue_requests_venueId_idx" ON "venue_requests"("venueId");

-- CreateIndex
CREATE INDEX "venue_requests_appliedVenueId_idx" ON "venue_requests"("appliedVenueId");

-- CreateIndex
CREATE INDEX "venue_requests_status_idx" ON "venue_requests"("status");

-- CreateIndex
CREATE INDEX "venue_requests_type_idx" ON "venue_requests"("type");

-- CreateIndex
CREATE INDEX "venue_requests_createdAt_idx" ON "venue_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_appliedVenueId_fkey" FOREIGN KEY ("appliedVenueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
