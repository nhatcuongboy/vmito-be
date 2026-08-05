INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES (
  'cfeatureflag0showshuttle01',
  'SHOW_SHUTTLECOCK_COUNT',
  false,
  'Controls the shuttlecock-count input in match results and its statistics/export column.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
