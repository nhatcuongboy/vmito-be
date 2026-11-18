-- Casual-session points were always written as BADMINTON regardless of the
-- session's sport. Re-tag them with the real sport. Totals in
-- user_points_states / guest_profile_points_states must be rebuilt afterwards
-- (POST /leaderboard/backfill rebuilds them).

UPDATE "point_transactions" pt
SET "sport" = s."sportType"
FROM "matches" m
JOIN "sessions" s ON s."id" = m."sessionId"
WHERE pt."refType" = 'MATCH'
  AND pt."refId" = m."id"
  AND pt."sport" <> s."sportType";

UPDATE "point_transactions" pt
SET "sport" = s."sportType"
FROM "sessions" s
WHERE pt."refType" = 'SESSION'
  AND pt."refId" = s."id"
  AND pt."sport" <> s."sportType";
