-- Add BEST_OF_5 to the MatchFormat enum (best-of-5 sets, first to 3).
ALTER TYPE "MatchFormat" ADD VALUE IF NOT EXISTS 'BEST_OF_5';
