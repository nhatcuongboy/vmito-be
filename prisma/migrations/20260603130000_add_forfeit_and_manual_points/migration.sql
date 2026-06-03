-- Forfeit/walkover flag: winnerId wins, the other side forfeited.
ALTER TABLE "category_matches" ADD COLUMN "isForfeit" BOOLEAN NOT NULL DEFAULT false;

-- Manually-assigned standings points (used when pointsEarning = 'manual').
ALTER TABLE "category_matches" ADD COLUMN "player1Points" INTEGER;
ALTER TABLE "category_matches" ADD COLUMN "player2Points" INTEGER;
