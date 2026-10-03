-- Shows the "Gợi ý cho bạn" (sparkle) ranking on the app's Discover tabs:
-- the toolbar button, the sort-sheet option and the one-time coach mark.
-- Off by default so the backend can ship before the app UI is switched on.
-- The app also requires AI_FEATURE_ENABLED, the global AI switch.
INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES (
  'cfeatureflag0discrecomm01',
  'DISCOVER_RECOMMEND_ENABLED',
  false,
  'Shows the "Gợi ý cho bạn" AI ranking (sortBy=recommended) on the app Discover tabs: toolbar sparkle button, sort option and coach mark.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
