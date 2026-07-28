CREATE TYPE "VenueRentalDepositMode" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');
CREATE TYPE "VenueRentalTransactionPurpose" AS ENUM ('DEPOSIT', 'BALANCE', 'REFUND');
CREATE TYPE "VenueRentalTransactionDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "VenueRentalPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH');
CREATE TYPE "VenueRentalTransactionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

ALTER TYPE "VenueRentalStatus" ADD VALUE 'AWAITING_DEPOSIT' BEFORE 'CONFIRMED';
ALTER TYPE "VenueRentalAllocationStatus" ADD VALUE 'RESERVED' BEFORE 'CONFIRMED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'PAYMENT_SUBMITTED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'PAYMENT_APPROVED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'PAYMENT_REJECTED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'DEPOSIT_EXPIRED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'REFUND_REQUIRED';
ALTER TYPE "VenueRentalEventType" ADD VALUE 'REFUND_COMPLETED';

CREATE TABLE "venue_rental_payment_settings" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "bankName" TEXT,
  "bankAccountNumber" TEXT,
  "bankAccountName" TEXT,
  "qrUrl" TEXT,
  "qrPublicId" TEXT,
  "depositMode" "VenueRentalDepositMode" NOT NULL DEFAULT 'NONE',
  "depositValue" INTEGER NOT NULL DEFAULT 0,
  "depositDeadlineMinutes" INTEGER NOT NULL DEFAULT 30,
  "balanceDueHours" INTEGER NOT NULL DEFAULT 2,
  "refundCutoffHours" INTEGER NOT NULL DEFAULT 24,
  "refundBeforePercent" INTEGER NOT NULL DEFAULT 100,
  "refundAfterPercent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_rental_payment_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venue_rental_payment_settings_deposit_value_check" CHECK (
    ("depositMode" = 'NONE' AND "depositValue" = 0) OR
    ("depositMode" = 'PERCENTAGE' AND "depositValue" BETWEEN 1 AND 100) OR
    ("depositMode" = 'FIXED' AND "depositValue" > 0)
  ),
  CONSTRAINT "venue_rental_payment_settings_deadline_check" CHECK ("depositDeadlineMinutes" BETWEEN 10 AND 1440),
  CONSTRAINT "venue_rental_payment_settings_percent_check" CHECK (
    "refundBeforePercent" BETWEEN 0 AND 100 AND "refundAfterPercent" BETWEEN 0 AND 100
  )
);

CREATE UNIQUE INDEX "venue_rental_payment_settings_venueId_key" ON "venue_rental_payment_settings"("venueId");
ALTER TABLE "venue_rental_payment_settings" ADD CONSTRAINT "venue_rental_payment_settings_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_rental_requests"
  ADD COLUMN "paymentDepositMode" "VenueRentalDepositMode",
  ADD COLUMN "paymentDepositValue" INTEGER,
  ADD COLUMN "paymentDepositDeadlineMinutes" INTEGER,
  ADD COLUMN "paymentBalanceDueHours" INTEGER,
  ADD COLUMN "paymentRefundCutoffHours" INTEGER,
  ADD COLUMN "paymentRefundBeforePercent" INTEGER,
  ADD COLUMN "paymentRefundAfterPercent" INTEGER,
  ADD COLUMN "paymentBankName" TEXT,
  ADD COLUMN "paymentBankAccountNumber" TEXT,
  ADD COLUMN "paymentBankAccountName" TEXT,
  ADD COLUMN "paymentQrUrl" TEXT,
  ADD COLUMN "paymentQrPublicId" TEXT,
  ADD COLUMN "depositAmount" INTEGER,
  ADD COLUMN "balanceAmount" INTEGER,
  ADD COLUMN "depositDueAt" TIMESTAMP(3),
  ADD COLUMN "balanceDueAt" TIMESTAMP(3),
  ADD COLUMN "depositReminderNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "balanceOverdueNotifiedAt" TIMESTAMP(3);

CREATE INDEX "venue_rental_requests_status_depositDueAt_idx" ON "venue_rental_requests"("status", "depositDueAt");
CREATE INDEX "venue_rental_requests_status_balanceDueAt_idx" ON "venue_rental_requests"("status", "balanceDueAt");

CREATE TABLE "venue_rental_transactions" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "purpose" "VenueRentalTransactionPurpose" NOT NULL,
  "direction" "VenueRentalTransactionDirection" NOT NULL,
  "method" "VenueRentalPaymentMethod",
  "status" "VenueRentalTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "proofUrl" TEXT,
  "proofPublicId" TEXT,
  "notes" TEXT,
  "submittedByUserId" TEXT,
  "processedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_rental_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venue_rental_transactions_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "venue_rental_transactions_direction_check" CHECK (
    ("purpose" = 'REFUND' AND "direction" = 'OUT') OR
    ("purpose" <> 'REFUND' AND "direction" = 'IN')
  )
);

CREATE INDEX "venue_rental_transactions_requestId_purpose_status_idx" ON "venue_rental_transactions"("requestId", "purpose", "status");
CREATE INDEX "venue_rental_transactions_status_createdAt_idx" ON "venue_rental_transactions"("status", "createdAt");
ALTER TABLE "venue_rental_transactions" ADD CONSTRAINT "venue_rental_transactions_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "venue_rental_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_rental_transactions" ADD CONSTRAINT "venue_rental_transactions_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_rental_transactions" ADD CONSTRAINT "venue_rental_transactions_processedByUserId_fkey"
  FOREIGN KEY ("processedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RESERVED must block the same Court just like active holds and confirmed bookings.
ALTER TABLE "venue_rental_court_allocations" DROP CONSTRAINT "venue_rental_court_allocations_no_overlap";
ALTER TABLE "venue_rental_court_allocations"
ADD CONSTRAINT "venue_rental_court_allocations_no_overlap"
EXCLUDE USING gist (
  "courtId" WITH =,
  tsrange("startTime", "endTime", '[)') WITH &&
)
WHERE ("status" IN ('HELD', 'RESERVED', 'CONFIRMED'));
