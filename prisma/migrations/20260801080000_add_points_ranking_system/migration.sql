-- CreateEnum
CREATE TYPE "public"."PointReason" AS ENUM ('SESSION_MATCH_WIN', 'SESSION_MATCH_DRAW', 'SESSION_MATCH_LOSS', 'SESSION_PARTICIPATION', 'TOURNAMENT_MATCH_WIN', 'TOURNAMENT_MATCH_DRAW', 'TOURNAMENT_MATCH_LOSS', 'TOURNAMENT_CHAMPION', 'TOURNAMENT_RUNNER_UP', 'TOURNAMENT_SEMIFINALIST', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."RankingTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- CreateTable
CREATE TABLE "public"."point_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" "public"."SportType" NOT NULL DEFAULT 'BADMINTON',
    "points" INTEGER NOT NULL,
    "reason" "public"."PointReason" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_points_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" "public"."SportType" NOT NULL DEFAULT 'BADMINTON',
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "tier" "public"."RankingTier" NOT NULL DEFAULT 'BRONZE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_points_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_transactions_sport_occurredAt_idx" ON "public"."point_transactions"("sport", "occurredAt");

-- CreateIndex
CREATE INDEX "point_transactions_userId_sport_occurredAt_idx" ON "public"."point_transactions"("userId", "sport", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_userId_reason_refId_key" ON "public"."point_transactions"("userId", "reason", "refId");

-- CreateIndex
CREATE INDEX "user_points_states_sport_totalPoints_idx" ON "public"."user_points_states"("sport", "totalPoints");

-- CreateIndex
CREATE UNIQUE INDEX "user_points_states_userId_sport_key" ON "public"."user_points_states"("userId", "sport");

-- AddForeignKey
ALTER TABLE "public"."point_transactions" ADD CONSTRAINT "point_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_points_states" ADD CONSTRAINT "user_points_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

