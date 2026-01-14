-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('HOST', 'PLAYER');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('PREPARING', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "public"."Level" AS ENUM ('Y', 'Y_PLUS', 'TBY', 'TB_MINUS', 'TB', 'TB_PLUS', 'Y_MINUS', 'K');

-- CreateEnum
CREATE TYPE "public"."PlayerStatus" AS ENUM ('WAITING', 'PLAYING', 'FINISHED', 'READY', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."CourtStatus" AS ENUM ('EMPTY', 'IN_USE', 'READY');

-- CreateEnum
CREATE TYPE "public"."CourtDirection" AS ENUM ('HORIZONTAL', 'VERTICAL');

-- CreateEnum
CREATE TYPE "public"."MatchStatus" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,

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
    "hostId" TEXT NOT NULL,
    "numberOfCourts" INTEGER NOT NULL DEFAULT 2,
    "sessionDuration" INTEGER NOT NULL DEFAULT 120,
    "maxPlayersPerCourt" INTEGER NOT NULL DEFAULT 8,
    "requirePlayerInfo" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'PREPARING',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allowGuestJoin" BOOLEAN NOT NULL DEFAULT true,
    "allowNewPlayers" BOOLEAN NOT NULL DEFAULT true,

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
    "level" "public"."Level",
    "phone" TEXT,
    "preFilledByHost" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByPlayer" BOOLEAN NOT NULL DEFAULT false,
    "currentWaitTime" INTEGER NOT NULL DEFAULT 0,
    "totalWaitTime" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."PlayerStatus" NOT NULL DEFAULT 'WAITING',
    "currentCourtId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "courtPosition" INTEGER,
    "desire" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "isJoined" BOOLEAN NOT NULL DEFAULT false,
    "joinCode" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "levelDescription" TEXT,
    "qrCodeData" TEXT,
    "requireConfirmInfo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."courts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "courtNumber" INTEGER NOT NULL,
    "courtName" TEXT,
    "status" "public"."CourtStatus" NOT NULL DEFAULT 'EMPTY',
    "currentMatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "direction" "public"."CourtDirection" NOT NULL DEFAULT 'HORIZONTAL',
    "preSelectedPlayers" JSONB,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDraw" BOOLEAN DEFAULT false,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "score" TEXT,
    "winnerIds" TEXT,

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

