-- Where a refund should be sent. The player fills this on a pending REFUND
-- transaction; nullable, so existing rows and older clients are unaffected.

-- AlterTable
ALTER TABLE "venue_rental_transactions"
  ADD COLUMN "refundBankName" TEXT,
  ADD COLUMN "refundAccountNumber" TEXT,
  ADD COLUMN "refundAccountName" TEXT;
