-- CreateEnum
CREATE TYPE "public"."TournamentRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."tournaments" ADD COLUMN     "registrationDeadline" TIMESTAMP(3),
ADD COLUMN     "registrationOpen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."categories" ADD COLUMN     "maxRegistrations" INTEGER,
ADD COLUMN     "registrationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."tournament_registration_requests" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guestPartnerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "message" TEXT,
    "status" "public"."TournamentRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "categoryRegistrationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registration_requests_categoryRegistrationId_key" ON "public"."tournament_registration_requests"("categoryRegistrationId");

-- CreateIndex
CREATE INDEX "tournament_registration_requests_tournamentId_status_idx" ON "public"."tournament_registration_requests"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "tournament_registration_requests_categoryId_status_idx" ON "public"."tournament_registration_requests"("categoryId", "status");

-- CreateIndex
CREATE INDEX "tournament_registration_requests_userId_idx" ON "public"."tournament_registration_requests"("userId");

-- AddForeignKey
ALTER TABLE "public"."tournament_registration_requests" ADD CONSTRAINT "tournament_registration_requests_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_registration_requests" ADD CONSTRAINT "tournament_registration_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_registration_requests" ADD CONSTRAINT "tournament_registration_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_registration_requests" ADD CONSTRAINT "tournament_registration_requests_categoryRegistrationId_fkey" FOREIGN KEY ("categoryRegistrationId") REFERENCES "public"."category_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

