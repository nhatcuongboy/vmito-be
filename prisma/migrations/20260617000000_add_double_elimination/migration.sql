-- Add DOUBLE_ELIMINATION to the CategoryFormat enum.
ALTER TYPE "CategoryFormat" ADD VALUE IF NOT EXISTS 'DOUBLE_ELIMINATION';

-- Double-elimination bracket linkage on category matches.
-- bracketType: 'UPPER' | 'LOWER' | 'GF' (null for single-elim / group matches).
-- Winner/loser routing stored explicitly (plain ids, no FK) so advancement does
-- not rely on positional index math (which only works for single elimination).
ALTER TABLE "category_matches" ADD COLUMN "bracketType" TEXT;
ALTER TABLE "category_matches" ADD COLUMN "winnerNextMatchId" TEXT;
ALTER TABLE "category_matches" ADD COLUMN "winnerNextSlot" INTEGER;
ALTER TABLE "category_matches" ADD COLUMN "loserNextMatchId" TEXT;
ALTER TABLE "category_matches" ADD COLUMN "loserNextSlot" INTEGER;
