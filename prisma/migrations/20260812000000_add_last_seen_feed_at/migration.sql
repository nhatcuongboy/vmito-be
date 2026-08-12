-- Add lastSeenFeedAt column to users table for tracking when user last viewed the newsfeed
ALTER TABLE "users" ADD COLUMN "lastSeenFeedAt" TIMESTAMP(3);

-- Create index for efficient querying of posts newer than lastSeenFeedAt
CREATE INDEX IF NOT EXISTS "posts_createdAt_idx" ON "posts"("createdAt");

