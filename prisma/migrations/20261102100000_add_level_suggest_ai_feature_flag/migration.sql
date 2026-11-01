-- Shows the "Mô tả bằng lời cho AI" path of the app's level assessment, backed
-- by POST /ai/suggest-level. Off by default so the backend can ship before
-- the app path is switched on. The app also requires AI_FEATURE_ENABLED, the
-- global AI switch. The multiple-choice quiz runs on the device and does not
-- depend on this flag.
INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES (
  'cfeatureflag0levelsuggest',
  'LEVEL_SUGGEST_AI_ENABLED',
  false,
  'Shows the AI "describe your level" path in the app level assessment (POST /ai/suggest-level). The on-device quiz is unaffected.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
