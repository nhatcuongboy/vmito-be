-- CreateEnum
CREATE TYPE "VenueCourtStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "VenueCourtBlockType" AS ENUM ('MAINTENANCE', 'CLOSED', 'PRIVATE_EVENT', 'MANUAL_HOLD');
CREATE TYPE "VenueRentalAllocationStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED');
CREATE TYPE "VenueRentalSelectionMode" AS ENUM ('AUTO_ASSIGN', 'SELECT_COURTS');
CREATE TYPE "VenueRentalSource" AS ENUM ('ONLINE', 'MANUAL');

-- Extend rental audit events.
ALTER TYPE "VenueRentalEventType" ADD VALUE 'MANUAL_CREATED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'COURTS_ALLOCATED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'COURTS_REALLOCATED';

-- Venue rollout flags. Existing venues stay on the aggregate-capacity flow.
ALTER TABLE "venues"
ADD COLUMN "courtSelectionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduleNeedsReview" BOOLEAN NOT NULL DEFAULT true;

-- Selection snapshots and support for manager-created offline bookings.
ALTER TABLE "venue_rental_quotes"
ADD COLUMN "selectionMode" "VenueRentalSelectionMode" NOT NULL DEFAULT 'AUTO_ASSIGN',
ADD COLUMN "requestedCourtIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "venue_rental_requests"
ALTER COLUMN "requesterId" DROP NOT NULL,
ALTER COLUMN "quoteId" DROP NOT NULL,
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "source" "VenueRentalSource" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN "selectionMode" "VenueRentalSelectionMode" NOT NULL DEFAULT 'AUTO_ASSIGN',
ADD COLUMN "requestedCourtIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "allocationNeedsReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "venue_rental_proposals"
ADD COLUMN "selectionMode" "VenueRentalSelectionMode" NOT NULL DEFAULT 'AUTO_ASSIGN',
ADD COLUMN "requestedCourtIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Offline bookings retain the manager/admin who created them.
ALTER TABLE "venue_rental_requests"
ADD CONSTRAINT "venue_rental_requests_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Physical Court inventory.
CREATE TABLE "venue_courts" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "VenueCourtStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_courts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_operating_periods" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_operating_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_operating_periods_day_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
    CONSTRAINT "venue_operating_periods_time_check" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
);

CREATE TABLE "venue_court_blocks" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "courtId" TEXT,
    "type" "VenueCourtBlockType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_court_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_court_blocks_time_check" CHECK ("endTime" > "startTime")
);

CREATE TABLE "venue_rental_court_allocations" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "quoteId" TEXT,
    "requestId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "VenueRentalAllocationStatus" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_rental_court_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_rental_court_allocations_time_check" CHECK ("endTime" > "startTime"),
    CONSTRAINT "venue_rental_court_allocations_owner_check" CHECK ("quoteId" IS NOT NULL OR "requestId" IS NOT NULL)
);

-- Indexes
CREATE UNIQUE INDEX "venue_courts_venueId_code_key" ON "venue_courts"("venueId", "code");
CREATE INDEX "venue_courts_venueId_status_displayOrder_idx" ON "venue_courts"("venueId", "status", "displayOrder");
CREATE INDEX "venue_operating_periods_venueId_dayOfWeek_startMinute_idx" ON "venue_operating_periods"("venueId", "dayOfWeek", "startMinute");
CREATE INDEX "venue_court_blocks_venueId_startTime_endTime_idx" ON "venue_court_blocks"("venueId", "startTime", "endTime");
CREATE INDEX "venue_court_blocks_courtId_startTime_endTime_idx" ON "venue_court_blocks"("courtId", "startTime", "endTime");
CREATE INDEX "venue_rental_court_allocations_venueId_startTime_endTime_status_idx" ON "venue_rental_court_allocations"("venueId", "startTime", "endTime", "status");
CREATE INDEX "venue_rental_court_allocations_courtId_startTime_endTime_status_idx" ON "venue_rental_court_allocations"("courtId", "startTime", "endTime", "status");
CREATE INDEX "venue_rental_court_allocations_quoteId_status_idx" ON "venue_rental_court_allocations"("quoteId", "status");
CREATE INDEX "venue_rental_court_allocations_requestId_status_idx" ON "venue_rental_court_allocations"("requestId", "status");

-- Foreign keys
ALTER TABLE "venue_courts" ADD CONSTRAINT "venue_courts_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_operating_periods" ADD CONSTRAINT "venue_operating_periods_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_court_blocks" ADD CONSTRAINT "venue_court_blocks_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_court_blocks" ADD CONSTRAINT "venue_court_blocks_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "venue_courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_court_blocks" ADD CONSTRAINT "venue_court_blocks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_rental_court_allocations" ADD CONSTRAINT "venue_rental_court_allocations_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_court_allocations" ADD CONSTRAINT "venue_rental_court_allocations_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "venue_courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_rental_court_allocations" ADD CONSTRAINT "venue_rental_court_allocations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "venue_rental_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_court_allocations" ADD CONSTRAINT "venue_rental_court_allocations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "venue_rental_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-level protection against overlapping active holds/bookings on one Court.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "venue_rental_court_allocations"
ADD CONSTRAINT "venue_rental_court_allocations_no_overlap"
EXCLUDE USING gist (
  "courtId" WITH =,
  tsrange("startTime", "endTime", '[)') WITH &&
)
WHERE ("status" IN ('HELD', 'CONFIRMED'));

-- Create Court 1..N from legacy capacity. Deterministic IDs keep the backfill idempotent.
INSERT INTO "venue_courts" ("id", "venueId", "name", "code", "status", "displayOrder", "createdAt", "updatedAt")
SELECT
  'vc_' || md5(v."id" || ':' || series.n::TEXT),
  v."id",
  'Court ' || series.n,
  'COURT-' || series.n,
  'ACTIVE'::"VenueCourtStatus",
  series.n,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "venues" v
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(v."numberOfCourts", 0), 0)) AS series(n)
ON CONFLICT ("venueId", "code") DO NOTHING;

-- Seed a permissive weekly schedule, but require owner review before visual selection.
INSERT INTO "venue_operating_periods" ("id", "venueId", "dayOfWeek", "startMinute", "endMinute", "createdAt", "updatedAt")
SELECT
  'vop_' || md5(v."id" || ':' || days.day::TEXT),
  v."id",
  days.day,
  0,
  1440,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "venues" v
CROSS JOIN generate_series(1, 7) AS days(day);
