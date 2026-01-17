-- CreateEnum
CREATE TYPE "public"."RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "public"."players" ADD COLUMN "registrationStatus" "public"."RegistrationStatus" NOT NULL DEFAULT 'APPROVED';
