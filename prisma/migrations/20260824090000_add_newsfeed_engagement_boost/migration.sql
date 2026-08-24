ALTER TABLE "feature_flags"
ADD COLUMN "clientVisible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "post_engagement_boosts" (
  "postId" TEXT NOT NULL,
  "targetCount" INTEGER NOT NULL,
  "currentCount" INTEGER NOT NULL DEFAULT 0,
  "nextLikeAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "post_engagement_boosts_pkey" PRIMARY KEY ("postId")
);

CREATE INDEX "post_engagement_boosts_nextLikeAt_idx"
ON "post_engagement_boosts"("nextLikeAt");

ALTER TABLE "post_engagement_boosts"
ADD CONSTRAINT "post_engagement_boosts_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "posts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "feature_flags" (
  "id",
  "key",
  "enabled",
  "clientVisible",
  "description",
  "createdAt",
  "updatedAt"
)
VALUES (
  'cfeatureflag0newsfeedboost01',
  'NEWSFEED_ENGAGEMENT_BOOST_ENABLED',
  false,
  false,
  'Controls server-managed gradual engagement boosts for newly created newsfeed posts.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "clientVisible" = false;
