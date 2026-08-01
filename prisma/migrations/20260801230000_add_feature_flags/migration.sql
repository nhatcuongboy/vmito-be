-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- Seed current hardcoded flag values so behavior is unchanged after cutover.
INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt") VALUES
    ('cfeatureflag0playervip00001', 'PLAYER_VIP_ENABLED', true, 'Allows PLAYER/REFEREE roles to access HOST features (clubs management, dashboard, courts, matches, payment tabs, etc.).', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('cfeatureflag0defaultuseai01', 'DEFAULT_USE_AI_FOR_CREATION', true, 'Default behavior for session creation: when enabled, "Create Session" buttons open the AI modal instead of the manual creation page.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
