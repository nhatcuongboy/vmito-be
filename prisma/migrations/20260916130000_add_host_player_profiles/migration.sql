-- CreateEnum
CREATE TYPE "PlayerProfileStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "host_player_profiles" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "clubId" TEXT,
    "name" TEXT NOT NULL,
    "gender" "Gender",
    "phone" TEXT,
    "level" INTEGER,
    "notes" TEXT,
    "status" "PlayerProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkedUserId" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_profile_points_states" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sport" "SportType" NOT NULL DEFAULT 'BADMINTON',
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "tier" "RankingTier" NOT NULL DEFAULT 'BRONZE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_profile_points_states_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "players" ADD COLUMN "profileId" TEXT;

-- AlterTable
ALTER TABLE "point_transactions" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "point_transactions" ADD COLUMN "guestProfileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "host_player_profiles_linkedUserId_key" ON "host_player_profiles"("linkedUserId");

-- CreateIndex
CREATE INDEX "host_player_profiles_hostId_idx" ON "host_player_profiles"("hostId");

-- CreateIndex
CREATE INDEX "host_player_profiles_clubId_idx" ON "host_player_profiles"("clubId");

-- CreateIndex
CREATE INDEX "host_player_profiles_hostId_name_idx" ON "host_player_profiles"("hostId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "guest_profile_points_states_profileId_sport_key" ON "guest_profile_points_states"("profileId", "sport");

-- CreateIndex
CREATE INDEX "guest_profile_points_states_sport_totalPoints_idx" ON "guest_profile_points_states"("sport", "totalPoints");

-- CreateIndex
CREATE INDEX "players_profileId_idx" ON "players"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_guestProfileId_reason_refId_key" ON "point_transactions"("guestProfileId", "reason", "refId");

-- CreateIndex
CREATE INDEX "point_transactions_guestProfileId_sport_occurredAt_idx" ON "point_transactions"("guestProfileId", "sport", "occurredAt");

-- AddForeignKey
ALTER TABLE "host_player_profiles" ADD CONSTRAINT "host_player_profiles_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_player_profiles" ADD CONSTRAINT "host_player_profiles_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_player_profiles" ADD CONSTRAINT "host_player_profiles_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_profile_points_states" ADD CONSTRAINT "guest_profile_points_states_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "host_player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "host_player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "host_player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
