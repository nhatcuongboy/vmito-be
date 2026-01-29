-- AlterTable
ALTER TABLE "users" ADD COLUMN "imagePublicId" TEXT;

-- AlterTable
ALTER TABLE "host_payment_settings" ADD COLUMN "qrCodePublicId" TEXT;

-- AlterTable
ALTER TABLE "payment_records" ADD COLUMN "proofImagePublicId" TEXT;
