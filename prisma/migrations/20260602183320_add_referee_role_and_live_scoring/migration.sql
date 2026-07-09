-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'REFEREE';

-- AlterTable
ALTER TABLE "public"."category_matches" ADD COLUMN     "pointLog" JSONB,
ADD COLUMN     "refereeId" TEXT,
ADD COLUMN     "scoreVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."tournament_umpires" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "category_matches_refereeId_idx" ON "public"."category_matches"("refereeId");

-- CreateIndex
CREATE INDEX "tournament_umpires_tournamentId_idx" ON "public"."tournament_umpires"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_umpires_userId_idx" ON "public"."tournament_umpires"("userId");

-- AddForeignKey
ALTER TABLE "public"."category_matches" ADD CONSTRAINT "category_matches_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "public"."tournament_umpires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_umpires" ADD CONSTRAINT "tournament_umpires_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
