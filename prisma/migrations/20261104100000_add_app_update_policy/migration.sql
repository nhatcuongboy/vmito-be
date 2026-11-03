-- Per-platform "must update" policy read by the mobile apps at launch. Off by
-- default so the backend can ship before any version is enforced. To enforce:
--   UPDATE "app_update_policies"
--   SET "enabled" = true, "minVersion" = '1.2.0', "updatedAt" = CURRENT_TIMESTAMP
--   WHERE "platform" = 'ios';
CREATE TABLE "app_update_policies" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minVersion" TEXT NOT NULL DEFAULT '0.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_update_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_update_policies_platform_key" ON "app_update_policies"("platform");

INSERT INTO "app_update_policies" ("id", "platform", "enabled", "minVersion", "updatedAt")
VALUES
  ('cappupdatepolicy0000ios', 'ios', false, '0.0.0', CURRENT_TIMESTAMP),
  ('cappupdatepolicy00android', 'android', false, '0.0.0', CURRENT_TIMESTAMP);
