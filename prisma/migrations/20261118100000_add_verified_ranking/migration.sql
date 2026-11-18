-- CreateEnum
CREATE TYPE "RankedResultStatus" AS ENUM ('INELIGIBLE', 'VERIFIED', 'DISPUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HonorReviewStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "HonorDecision" AS ENUM ('PENDING', 'APPROVED', 'EXCLUDED');

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "rankedDisputeNote" TEXT,
ADD COLUMN     "rankedDisputeReason" TEXT,
ADD COLUMN     "rankedDisputedById" TEXT,
ADD COLUMN     "rankedIneligibleReason" TEXT,
ADD COLUMN     "rankedResolvedAt" TIMESTAMP(3),
ADD COLUMN     "rankedReviewNote" TEXT,
ADD COLUMN     "rankedReviewedById" TEXT,
ADD COLUMN     "rankedStatus" "RankedResultStatus",
ADD COLUMN     "resultSubmittedById" TEXT;

-- CreateTable
CREATE TABLE "ranked_point_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" "SportType" NOT NULL DEFAULT 'BADMINTON',
    "reason" "PointReason" NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "points" INTEGER NOT NULL,
    "refType" TEXT NOT NULL DEFAULT 'MATCH',
    "refId" TEXT NOT NULL,
    "opponentUserIds" TEXT[],
    "guestOpponents" INTEGER NOT NULL DEFAULT 0,
    "sessionHostId" TEXT,
    "matchMinutes" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranked_point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "honor_reviews" (
    "id" TEXT NOT NULL,
    "sport" "SportType" NOT NULL,
    "period" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "HonorReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "honor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "honor_review_entries" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "matches" INTEGER NOT NULL,
    "opponents" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "flags" TEXT[],
    "decision" "HonorDecision" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "publicRank" INTEGER,

    CONSTRAINT "honor_review_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranked_point_transactions_sport_occurredAt_idx" ON "ranked_point_transactions"("sport", "occurredAt");

-- CreateIndex
CREATE INDEX "ranked_point_transactions_userId_sport_occurredAt_idx" ON "ranked_point_transactions"("userId", "sport", "occurredAt");

-- CreateIndex
CREATE INDEX "ranked_point_transactions_refType_refId_idx" ON "ranked_point_transactions"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "ranked_point_transactions_userId_refType_refId_key" ON "ranked_point_transactions"("userId", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "honor_reviews_sport_period_periodKey_key" ON "honor_reviews"("sport", "period", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "honor_review_entries_reviewId_userId_key" ON "honor_review_entries"("reviewId", "userId");

-- CreateIndex
CREATE INDEX "matches_rankedStatus_endTime_idx" ON "matches"("rankedStatus", "endTime");

-- AddForeignKey
ALTER TABLE "ranked_point_transactions" ADD CONSTRAINT "ranked_point_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "honor_review_entries" ADD CONSTRAINT "honor_review_entries_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "honor_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "honor_review_entries" ADD CONSTRAINT "honor_review_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

