-- Moving a confirmed booking: a proposal of its own kind, plus the full
-- segment list so multi-range proposals survive until accepted.
CREATE TYPE "VenueRentalProposalKind" AS ENUM ('OFFER', 'RESCHEDULE');
ALTER TABLE "venue_rental_proposals"
  ADD COLUMN "kind" "VenueRentalProposalKind" NOT NULL DEFAULT 'OFFER',
  ADD COLUMN "segments" JSONB;

ALTER TYPE "VenueRentalEventType" ADD VALUE 'RESCHEDULE_PROPOSED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'RESCHEDULED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'NO_SHOW_MARKED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'NO_SHOW_CLEARED';

-- A refund for a price drop, unlike a cancellation refund, leaves the booking
-- alive, so a later cancellation has to be able to refund the rest.
ALTER TABLE "venue_rental_transactions"
  ADD COLUMN "isAdjustment" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "venue_rental_requests"
  ADD COLUMN "noShowAt" TIMESTAMP(3),
  ADD COLUMN "noShowMarkedById" TEXT;
