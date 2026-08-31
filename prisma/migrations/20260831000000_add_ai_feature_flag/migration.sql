INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES (
  'cfeatureflag0aifeature001',
  'AI_FEATURE_ENABLED',
  true,
  'Global switch for all AI features across the site (AI assistant, AI session creation, AI match analysis, AI-powered court matching).',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
