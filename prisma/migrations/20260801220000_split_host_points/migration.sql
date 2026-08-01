-- Host rewards are ranked on their own board, so keep them out of totalPoints.
ALTER TABLE "public"."user_points_states" ADD COLUMN "hostPoints" INTEGER NOT NULL DEFAULT 0;

-- Move existing SESSION_HOSTED points out of the player total.
UPDATE "public"."user_points_states" s
SET "hostPoints" = h.points,
    "totalPoints" = s."totalPoints" - h.points
FROM (
  SELECT "userId", "sport", SUM("points")::int AS points
  FROM "public"."point_transactions"
  WHERE "reason" = 'SESSION_HOSTED'
  GROUP BY "userId", "sport"
) h
WHERE s."userId" = h."userId" AND s."sport" = h."sport";

CREATE INDEX "user_points_states_sport_hostPoints_idx" ON "public"."user_points_states"("sport", "hostPoints");
