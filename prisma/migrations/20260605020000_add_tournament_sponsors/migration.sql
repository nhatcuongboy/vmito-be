-- A sponsor displayed on a tournament's public page.
CREATE TABLE "tournament_sponsors" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "logoPublicId" TEXT,
    "website" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_sponsors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tournament_sponsors_tournamentId_idx" ON "tournament_sponsors"("tournamentId");

ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
