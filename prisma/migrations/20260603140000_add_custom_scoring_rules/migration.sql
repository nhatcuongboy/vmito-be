-- Add customizable set scoring rules to categories and per-match overrides.
-- Defaults preserve current BWF behavior (21 / win-by-2 / hard cap 30).

ALTER TABLE "public"."categories"
  ADD COLUMN "pointsToWin" INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "winByTwo"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pointCap"    INTEGER DEFAULT 30;

ALTER TABLE "public"."category_matches"
  ADD COLUMN "pointsToWin" INTEGER,
  ADD COLUMN "winByTwo"    BOOLEAN,
  ADD COLUMN "pointCap"    INTEGER;
