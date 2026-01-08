-- CreateEnum
CREATE TYPE "public"."TournamentStatus" AS ENUM ('PREPARING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MatchFormat" AS ENUM ('BEST_OF_1', 'BEST_OF_3');

-- CreateEnum
CREATE TYPE "public"."CategoryType" AS ENUM ('MENS_SINGLE', 'WOMENS_SINGLE', 'MENS_DOUBLE', 'WOMENS_DOUBLE', 'MIXED_DOUBLE');

-- AlterEnum: Add SCHEDULED to MatchStatus
-- Note: Adding CANCELLED will be done in a separate migration
-- to avoid PostgreSQL enum value addition issues in a single transaction
ALTER TYPE "public"."MatchStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

-- CreateTable
CREATE TABLE "public"."tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" "public"."TournamentStatus" NOT NULL DEFAULT 'PREPARING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."CategoryType" NOT NULL,
    "hasGroupStage" BOOLEAN NOT NULL DEFAULT false,
    "averageMatchDuration" INTEGER,
    "groupCount" INTEGER,
    "winnersPerGroup" INTEGER,
    "playersPerGroup" INTEGER,
    "matchFormat" "public"."MatchFormat" NOT NULL DEFAULT 'BEST_OF_3',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."category_registrations" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "tournamentPlayerId" TEXT,
    "tournamentPairId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."category_groups" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "groupNumber" INTEGER NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."category_group_registrations" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "categoryRegistrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_group_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."category_matches" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "groupId" TEXT,
    "round" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "status" "public"."MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "courtId" TEXT,
    "score" TEXT,
    "sets" JSONB,
    "winnerId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "player1Score" INTEGER,
    "player2Score" INTEGER,
    "player3Score" INTEGER,
    "player4Score" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."category_match_participants" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "categoryRegistrationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_match_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_umpires" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_umpires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_scoring_devices" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT,
    "deviceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_scoring_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_courts" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "courtNumber" INTEGER NOT NULL,
    "courtName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_players" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "gender" "public"."Gender",
    "level" "public"."Level",
    "levelDescription" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "tournament_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_pairs" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_pair_members" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_pair_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_tournamentId_name_key" ON "public"."categories"("tournamentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "category_registrations_categoryId_tournamentPlayerId_key" ON "public"."category_registrations"("categoryId", "tournamentPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "category_registrations_categoryId_tournamentPairId_key" ON "public"."category_registrations"("categoryId", "tournamentPairId");

-- CreateIndex
CREATE UNIQUE INDEX "category_groups_categoryId_groupNumber_key" ON "public"."category_groups"("categoryId", "groupNumber");

-- CreateIndex
CREATE UNIQUE INDEX "category_group_registrations_groupId_categoryRegistrationId_key" ON "public"."category_group_registrations"("groupId", "categoryRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "category_match_participants_matchId_categoryRegistrationId_key" ON "public"."category_match_participants"("matchId", "categoryRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "category_match_participants_matchId_position_key" ON "public"."category_match_participants"("matchId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_courts_tournamentId_courtNumber_key" ON "public"."tournament_courts"("tournamentId", "courtNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_pair_members_pairId_playerId_key" ON "public"."tournament_pair_members"("pairId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_pair_members_pairId_position_key" ON "public"."tournament_pair_members"("pairId", "position");

-- AddForeignKey
ALTER TABLE "public"."tournaments" ADD CONSTRAINT "tournaments_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."categories" ADD CONSTRAINT "categories_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_registrations" ADD CONSTRAINT "category_registrations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_registrations" ADD CONSTRAINT "category_registrations_tournamentPlayerId_fkey" FOREIGN KEY ("tournamentPlayerId") REFERENCES "public"."tournament_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_registrations" ADD CONSTRAINT "category_registrations_tournamentPairId_fkey" FOREIGN KEY ("tournamentPairId") REFERENCES "public"."tournament_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_groups" ADD CONSTRAINT "category_groups_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_group_registrations" ADD CONSTRAINT "category_group_registrations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."category_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_group_registrations" ADD CONSTRAINT "category_group_registrations_categoryRegistrationId_fkey" FOREIGN KEY ("categoryRegistrationId") REFERENCES "public"."category_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_matches" ADD CONSTRAINT "category_matches_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_matches" ADD CONSTRAINT "category_matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."category_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_matches" ADD CONSTRAINT "category_matches_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "public"."tournament_courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_match_participants" ADD CONSTRAINT "category_match_participants_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."category_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_match_participants" ADD CONSTRAINT "category_match_participants_categoryRegistrationId_fkey" FOREIGN KEY ("categoryRegistrationId") REFERENCES "public"."category_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_umpires" ADD CONSTRAINT "tournament_umpires_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_scoring_devices" ADD CONSTRAINT "tournament_scoring_devices_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_courts" ADD CONSTRAINT "tournament_courts_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_players" ADD CONSTRAINT "tournament_players_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_players" ADD CONSTRAINT "tournament_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_pairs" ADD CONSTRAINT "tournament_pairs_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_pair_members" ADD CONSTRAINT "tournament_pair_members_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "public"."tournament_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_pair_members" ADD CONSTRAINT "tournament_pair_members_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."tournament_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
