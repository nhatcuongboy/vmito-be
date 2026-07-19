-- CreateEnum
CREATE TYPE "VenueManagerRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "VenueRentalStatus" AS ENUM ('PENDING', 'COUNTER_OFFERED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VenueRentalProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VenueRentalEventType" AS ENUM ('CREATED', 'APPROVED', 'REJECTED', 'COUNTER_OFFERED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED', 'PROPOSAL_EXPIRED', 'CANCELLED', 'SESSION_LINKED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VENUE_RENTAL';

-- AlterTable
ALTER TABLE "venues"
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
ADD COLUMN "rentalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "venue_managers" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "VenueManagerRole" NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_managers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_rental_quotes" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "numberOfCourts" INTEGER NOT NULL,
    "customerType" "VenueCustomerType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "totalAmount" INTEGER NOT NULL,
    "priceBookId" TEXT,
    "breakdown" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_rental_quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_rental_requests" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" "VenueRentalStatus" NOT NULL DEFAULT 'PENDING',
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "confirmedStartTime" TIMESTAMP(3),
    "confirmedEndTime" TIMESTAMP(3),
    "confirmedNumberOfCourts" INTEGER,
    "confirmedCustomerType" "VenueCustomerType",
    "confirmedAmount" INTEGER,
    "confirmedCurrency" TEXT,
    "confirmedBreakdown" JSONB,
    "reviewedByUserId" TEXT,
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_rental_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_rental_proposals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "numberOfCourts" INTEGER NOT NULL,
    "customerType" "VenueCustomerType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "totalAmount" INTEGER NOT NULL,
    "priceBookId" TEXT,
    "breakdown" JSONB NOT NULL,
    "status" "VenueRentalProposalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_rental_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_rental_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "VenueRentalEventType" NOT NULL,
    "fromStatus" "VenueRentalStatus",
    "toStatus" "VenueRentalStatus",
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_rental_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "venue_managers_venueId_userId_key" ON "venue_managers"("venueId", "userId");
CREATE INDEX "venue_managers_userId_idx" ON "venue_managers"("userId");
CREATE INDEX "venue_rental_quotes_venueId_startTime_endTime_idx" ON "venue_rental_quotes"("venueId", "startTime", "endTime");
CREATE INDEX "venue_rental_quotes_requesterId_createdAt_idx" ON "venue_rental_quotes"("requesterId", "createdAt");
CREATE INDEX "venue_rental_quotes_expiresAt_idx" ON "venue_rental_quotes"("expiresAt");
CREATE UNIQUE INDEX "venue_rental_requests_quoteId_key" ON "venue_rental_requests"("quoteId");
CREATE INDEX "venue_rental_requests_venueId_status_createdAt_idx" ON "venue_rental_requests"("venueId", "status", "createdAt");
CREATE INDEX "venue_rental_requests_venueId_confirmedStartTime_confirmedEndTime_idx" ON "venue_rental_requests"("venueId", "confirmedStartTime", "confirmedEndTime");
CREATE INDEX "venue_rental_requests_requesterId_createdAt_idx" ON "venue_rental_requests"("requesterId", "createdAt");
CREATE INDEX "venue_rental_requests_sessionId_idx" ON "venue_rental_requests"("sessionId");
CREATE INDEX "venue_rental_proposals_requestId_status_createdAt_idx" ON "venue_rental_proposals"("requestId", "status", "createdAt");
CREATE INDEX "venue_rental_proposals_expiresAt_status_idx" ON "venue_rental_proposals"("expiresAt", "status");
CREATE INDEX "venue_rental_events_requestId_createdAt_idx" ON "venue_rental_events"("requestId", "createdAt");

-- Foreign keys
ALTER TABLE "venue_managers" ADD CONSTRAINT "venue_managers_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_managers" ADD CONSTRAINT "venue_managers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_quotes" ADD CONSTRAINT "venue_rental_quotes_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_quotes" ADD CONSTRAINT "venue_rental_quotes_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_quotes" ADD CONSTRAINT "venue_rental_quotes_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "venue_price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "venue_rental_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_rental_requests" ADD CONSTRAINT "venue_rental_requests_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_rental_proposals" ADD CONSTRAINT "venue_rental_proposals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "venue_rental_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_proposals" ADD CONSTRAINT "venue_rental_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_rental_events" ADD CONSTRAINT "venue_rental_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "venue_rental_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_events" ADD CONSTRAINT "venue_rental_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
