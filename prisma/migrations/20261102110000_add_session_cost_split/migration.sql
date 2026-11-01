-- AlterTable
ALTER TABLE "session_fee_configs" ADD COLUMN     "splitMaleAmount" INTEGER,
ADD COLUMN     "splitFemaleAmount" INTEGER;

-- AlterTable
ALTER TABLE "payment_records" ADD COLUMN     "splitLocked" BOOLEAN NOT NULL DEFAULT false;
