-- Per-stage scoring overrides on categories.
-- Base columns (pointsToWin / winByTwo / pointCap) continue to apply to GROUP
-- stage and serve as fallback for the other stages.
--   - knockout* applies to non-GROUP, non-Final rounds (R*, QF, SF, 3RD).
--     Null = inherit from base.
--   - final* applies to the Final round (F). Null = inherit from knockout
--     (then from base).

ALTER TABLE "public"."categories"
  ADD COLUMN "knockoutPointsToWin" INTEGER,
  ADD COLUMN "knockoutWinByTwo"    BOOLEAN,
  ADD COLUMN "knockoutPointCap"    INTEGER,
  ADD COLUMN "finalPointsToWin"    INTEGER,
  ADD COLUMN "finalWinByTwo"       BOOLEAN,
  ADD COLUMN "finalPointCap"       INTEGER;
