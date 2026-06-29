-- Pickleball doubles serve state. Null for badminton, pickleball singles, or
-- non-live matches. servingSide: 1 | 2, serverNumber: 1 | 2.
ALTER TABLE "public"."category_matches"
  ADD COLUMN "servingSide" INTEGER,
  ADD COLUMN "serverNumber" INTEGER;
