-- CreateEnum
CREATE TYPE "ClosureStatus" AS ENUM ('OPERATING', 'PERMANENTLY_CLOSED', 'TEMPORARILY_CLOSED');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN "hasCarParking" BOOLEAN,
ADD COLUMN "hasCanteen" BOOLEAN,
ADD COLUMN "wifiName" TEXT,
ADD COLUMN "wifiPassword" TEXT,
ADD COLUMN "closureStatus" "ClosureStatus" NOT NULL DEFAULT 'OPERATING',
ADD COLUMN "bookingPolicy" TEXT,
ADD COLUMN "locatedWithin" TEXT;
