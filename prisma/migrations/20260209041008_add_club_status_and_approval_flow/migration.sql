-- CreateEnum
CREATE TYPE "public"."ClubStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "public"."clubs" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "public"."ClubStatus" NOT NULL DEFAULT 'APPROVED';
