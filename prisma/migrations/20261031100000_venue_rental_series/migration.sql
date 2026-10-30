-- Weekly fixed bookings. Each session stays an ordinary rental request, so
-- the court board, payments, cancellation and reports need no special case.
CREATE TYPE "VenueRentalSeriesStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED');

CREATE TABLE "venue_rental_series" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "requesterId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "source" "VenueRentalSource" NOT NULL DEFAULT 'ONLINE',
    "status" "VenueRentalSeriesStatus" NOT NULL DEFAULT 'PENDING',
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "notes" TEXT,
    "customerType" "VenueCustomerType" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "courtIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_rental_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "venue_rental_series_venueId_status_idx" ON "venue_rental_series"("venueId", "status");
CREATE INDEX "venue_rental_series_requesterId_idx" ON "venue_rental_series"("requesterId");
ALTER TABLE "venue_rental_series" ADD CONSTRAINT "venue_rental_series_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_rental_requests" ADD COLUMN "seriesId" TEXT;
CREATE INDEX "venue_rental_requests_seriesId_idx" ON "venue_rental_requests"("seriesId");
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "venue_rental_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One transfer covering several sessions: one row per session, same batch.
ALTER TABLE "venue_rental_transactions" ADD COLUMN "batchId" TEXT;
CREATE INDEX "venue_rental_transactions_batchId_idx" ON "venue_rental_transactions"("batchId");
