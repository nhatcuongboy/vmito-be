-- CreateEnum
CREATE TYPE "TournamentCourtStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- AlterTable: Add schedule management fields to CategoryMatch
ALTER TABLE "category_matches" ADD COLUMN "queueOrder" INTEGER;
ALTER TABLE "category_matches" ADD COLUMN "isQueued" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "category_matches" ADD COLUMN "scheduledDuration" INTEGER;
ALTER TABLE "category_matches" ADD COLUMN "estimatedEndTime" TIMESTAMP(3);
ALTER TABLE "category_matches" ADD COLUMN "autoAssignedAt" TIMESTAMP(3);
ALTER TABLE "category_matches" ADD COLUMN "assignedBy" TEXT;

-- AlterTable: Add status and currentMatchId to TournamentCourt
ALTER TABLE "tournament_courts" ADD COLUMN "status" "TournamentCourtStatus" NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "tournament_courts" ADD COLUMN "currentMatchId" TEXT;

-- CreateIndex: Unique constraint on currentMatchId
CREATE UNIQUE INDEX "tournament_courts_currentMatchId_key" ON "tournament_courts"("currentMatchId");

-- AddForeignKey: Link currentMatchId to CategoryMatch
ALTER TABLE "tournament_courts" ADD CONSTRAINT "tournament_courts_currentMatchId_fkey" 
  FOREIGN KEY ("currentMatchId") REFERENCES "category_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
