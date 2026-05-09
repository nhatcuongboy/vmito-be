-- CreateTable: TournamentVenue
CREATE TABLE "tournament_venues" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_venues_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add tournamentVenueId to TournamentCourt
ALTER TABLE "tournament_courts" ADD COLUMN "tournamentVenueId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tournament_venues_tournamentId_venueId_key" ON "tournament_venues"("tournamentId", "venueId");

-- AddForeignKey
ALTER TABLE "tournament_venues" ADD CONSTRAINT "tournament_venues_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_venues" ADD CONSTRAINT "tournament_venues_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tournament_courts" ADD CONSTRAINT "tournament_courts_tournamentVenueId_fkey" FOREIGN KEY ("tournamentVenueId") REFERENCES "tournament_venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
