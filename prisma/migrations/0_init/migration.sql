-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('HOST', 'PLAYER');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('PREPARING', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "public"."PlayerStatus" AS ENUM ('WAITING', 'PLAYING', 'FINISHED', 'READY', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."CourtStatus" AS ENUM ('EMPTY', 'IN_USE', 'READY');

-- CreateEnum
CREATE TYPE "public"."CourtDirection" AS ENUM ('HORIZONTAL', 'VERTICAL');

-- CreateEnum
CREATE TYPE "public"."MatchStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."TournamentStatus" AS ENUM ('PREPARING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MatchFormat" AS ENUM ('BEST_OF_1', 'BEST_OF_3');

-- CreateEnum
CREATE TYPE "public"."CategoryType" AS ENUM ('MENS_SINGLE', 'WOMENS_SINGLE', 'MENS_DOUBLE', 'WOMENS_DOUBLE', 'MIXED_DOUBLE');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'PLAYER',
    "gender" "public"."Gender",
    "level" INTEGER,
    "levelDescription" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "hostId" TEXT NOT NULL,
    "numberOfCourts" INTEGER NOT NULL DEFAULT 2,
    "sessionDuration" INTEGER NOT NULL DEFAULT 120,
    "maxPlayersPerCourt" INTEGER NOT NULL DEFAULT 8,
    "requirePlayerInfo" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'PREPARING',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "allowGuestJoin" BOOLEAN NOT NULL DEFAULT true,
    "allowNewPlayers" BOOLEAN NOT NULL DEFAULT true,
    "requiredLevels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "courtColor" TEXT NOT NULL DEFAULT '#179a3b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."players" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "playerNumber" INTEGER NOT NULL,
    "name" TEXT,
    "gender" "public"."Gender",
    "level" INTEGER,
    "levelDescription" TEXT,
    "desire" TEXT,
    "phone" TEXT,
    "preFilledByHost" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByPlayer" BOOLEAN NOT NULL DEFAULT false,
    "requireConfirmInfo" BOOLEAN NOT NULL DEFAULT false,
    "currentWaitTime" INTEGER NOT NULL DEFAULT 0,
    "totalWaitTime" INTEGER NOT NULL DEFAULT 0,
    "waitingSince" TIMESTAMP(3),
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."PlayerStatus" NOT NULL DEFAULT 'WAITING',
    "currentCourtId" TEXT,
    "courtPosition" INTEGER,
    "joinCode" TEXT NOT NULL,
    "qrCodeData" TEXT,
    "isJoined" BOOLEAN NOT NULL DEFAULT false,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."courts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "courtNumber" INTEGER NOT NULL,
    "courtName" TEXT,
    "direction" "public"."CourtDirection" NOT NULL DEFAULT 'HORIZONTAL',
    "status" "public"."CourtStatus" NOT NULL DEFAULT 'EMPTY',
    "currentMatchId" TEXT,
    "preSelectedPlayers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."matches" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "status" "public"."MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "score" TEXT,
    "winnerIds" TEXT,
    "isDraw" BOOLEAN DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."match_players" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

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
    "matchFormat" "public"."MatchFormat",
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
    "level" INTEGER,
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
    "type" "public"."CategoryType",
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
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "public"."accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_sessionToken_key" ON "public"."auth_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "public"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "public"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "players_joinCode_key" ON "public"."players"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "players_sessionId_playerNumber_key" ON "public"."players"("sessionId", "playerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "courts_currentMatchId_key" ON "public"."courts"("currentMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "courts_sessionId_courtNumber_key" ON "public"."courts"("sessionId", "courtNumber");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_matchId_playerId_key" ON "public"."match_players"("matchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_matchId_position_key" ON "public"."match_players"("matchId", "position");

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
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."players" ADD CONSTRAINT "players_currentCourtId_fkey" FOREIGN KEY ("currentCourtId") REFERENCES "public"."courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."players" ADD CONSTRAINT "players_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."players" ADD CONSTRAINT "players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."courts" ADD CONSTRAINT "courts_currentMatchId_fkey" FOREIGN KEY ("currentMatchId") REFERENCES "public"."matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."courts" ADD CONSTRAINT "courts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "public"."courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_players" ADD CONSTRAINT "match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_players" ADD CONSTRAINT "match_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

