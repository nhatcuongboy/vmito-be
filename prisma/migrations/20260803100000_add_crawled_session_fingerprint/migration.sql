-- A Facebook author can publish the same recruitment post in several groups.
-- Each copy has a distinct permalink, so externalUrl alone cannot deduplicate it.
ALTER TABLE "public"."sessions" ADD COLUMN "crawlFingerprint" TEXT;

CREATE UNIQUE INDEX "sessions_crawlFingerprint_key"
ON "public"."sessions"("crawlFingerprint");
