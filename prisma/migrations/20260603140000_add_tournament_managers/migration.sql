-- Per-tournament permission scopes a host can grant to a manager.
CREATE TYPE "TournamentPermission" AS ENUM ('RESULTS', 'SCHEDULE', 'PARTICIPANTS', 'STRUCTURE');

-- Users (other than the host) granted scoped management rights over a tournament.
CREATE TABLE "tournament_managers" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" "TournamentPermission"[],
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_managers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tournament_managers_userId_idx" ON "tournament_managers"("userId");
CREATE UNIQUE INDEX "tournament_managers_tournamentId_userId_key" ON "tournament_managers"("tournamentId", "userId");

ALTER TABLE "tournament_managers" ADD CONSTRAINT "tournament_managers_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_managers" ADD CONSTRAINT "tournament_managers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
