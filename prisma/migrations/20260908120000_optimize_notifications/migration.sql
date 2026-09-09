-- Add idempotency and feed indexes to direct notifications.
ALTER TABLE "notifications"
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "notifications_dedupeKey_key"
  ON "notifications"("dedupeKey");
CREATE INDEX "notifications_userId_createdAt_idx"
  ON "notifications"("userId", "createdAt" DESC);
CREATE INDEX "notifications_unread_userId_idx"
  ON "notifications"("userId") WHERE "isRead" = false;
CREATE INDEX "notifications_read_createdAt_idx"
  ON "notifications"("createdAt") WHERE "isRead" = true;
CREATE INDEX "users_createdAt_idx"
  ON "users"("createdAt");

-- One content row per admin broadcast. Per-user rows are sparse and only
-- created after a user reads or deletes an individual broadcast.
CREATE TYPE "NotificationDispatchStatus" AS ENUM
  ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "broadcast_notifications" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "data" JSONB,
  "createdById" TEXT,
  "dedupeKey" TEXT,
  "audienceCutoffAt" TIMESTAMP(3) NOT NULL,
  "audienceCount" INTEGER NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "broadcast_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "broadcast_notification_user_states" (
  "id" TEXT NOT NULL,
  "broadcastId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcast_notification_user_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_inbox_states" (
  "userId" TEXT NOT NULL,
  "broadcastReadThroughAt" TIMESTAMP(3),
  "broadcastDeletedThroughAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_inbox_states_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "broadcast_notification_dispatch_jobs" (
  "id" TEXT NOT NULL,
  "broadcastId" TEXT NOT NULL,
  "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "cursor" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcast_notification_dispatch_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "broadcast_notifications_createdAt_idx"
  ON "broadcast_notifications"("createdAt" DESC);
CREATE UNIQUE INDEX "broadcast_notifications_dedupeKey_key"
  ON "broadcast_notifications"("dedupeKey");
CREATE INDEX "broadcast_notifications_deletedAt_createdAt_idx"
  ON "broadcast_notifications"("deletedAt", "createdAt" DESC);
CREATE UNIQUE INDEX "broadcast_notification_user_states_broadcastId_userId_key"
  ON "broadcast_notification_user_states"("broadcastId", "userId");
CREATE INDEX "broadcast_notification_user_states_userId_idx"
  ON "broadcast_notification_user_states"("userId");
CREATE INDEX "broadcast_notification_user_states_broadcastId_readAt_idx"
  ON "broadcast_notification_user_states"("broadcastId", "readAt");
CREATE INDEX "notification_inbox_states_broadcastReadThroughAt_idx"
  ON "notification_inbox_states"("broadcastReadThroughAt");
CREATE UNIQUE INDEX "broadcast_notification_dispatch_jobs_broadcastId_key"
  ON "broadcast_notification_dispatch_jobs"("broadcastId");
CREATE INDEX "broadcast_notification_dispatch_jobs_status_availableAt_idx"
  ON "broadcast_notification_dispatch_jobs"("status", "availableAt");

ALTER TABLE "broadcast_notifications"
  ADD CONSTRAINT "broadcast_notifications_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "broadcast_notification_user_states"
  ADD CONSTRAINT "broadcast_notification_user_states_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "broadcast_notifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_notification_user_states"
  ADD CONSTRAINT "broadcast_notification_user_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_inbox_states"
  ADD CONSTRAINT "notification_inbox_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_notification_dispatch_jobs"
  ADD CONSTRAINT "broadcast_notification_dispatch_jobs_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "broadcast_notifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
