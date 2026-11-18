-- Player honor (verified ranking) in the app: the "Vinh danh" leaderboard tab,
-- my ranked matches, disputes and published honor lists. Off by default: the
-- ranked ledger keeps recording every match in the background, so switching it
-- on mid-period still ranks the whole period. Admin endpoints work either way.
INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES (
  'cfeatureflag0playerhonor',
  'PLAYER_HONOR_ENABLED',
  false,
  'Player honor ranking (verified board, my ranked matches, disputes, honor lists). The ranked ledger records matches even when off.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
