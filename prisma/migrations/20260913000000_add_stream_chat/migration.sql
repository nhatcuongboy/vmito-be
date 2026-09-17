-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT';

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "chatTermsAcceptedVersion" TEXT,
ADD COLUMN "chatTermsAcceptedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "ChatConversationStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "streamChannelId" TEXT NOT NULL,
    "status" "ChatConversationStatus" NOT NULL,
    "initialMessageId" TEXT,
    "idempotencyKey" TEXT,
    "requestSentAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_conversations_streamChannelId_key" ON "chat_conversations"("streamChannelId");
CREATE UNIQUE INDEX "chat_conversations_idempotencyKey_key" ON "chat_conversations"("idempotencyKey");
CREATE UNIQUE INDEX "chat_conversations_participantAId_participantBId_key" ON "chat_conversations"("participantAId", "participantBId");
CREATE INDEX "chat_conversations_recipientId_status_createdAt_idx" ON "chat_conversations"("recipientId", "status", "createdAt" DESC);
CREATE INDEX "chat_conversations_requesterId_status_createdAt_idx" ON "chat_conversations"("requesterId", "status", "createdAt" DESC);
CREATE INDEX "chat_conversations_requesterId_requestSentAt_idx" ON "chat_conversations"("requesterId", "requestSentAt");
CREATE UNIQUE INDEX "chat_blocks_blockerId_blockedId_key" ON "chat_blocks"("blockerId", "blockedId");
CREATE INDEX "chat_blocks_blockedId_idx" ON "chat_blocks"("blockedId");

ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Durable FCM outbox for generic pending-chat notifications. It is separate
-- from Stream message creation, so retries can never create a second message.
CREATE TABLE "notification_push_dispatch_jobs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_push_dispatch_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_push_dispatch_jobs_notificationId_key" ON "notification_push_dispatch_jobs"("notificationId");
CREATE INDEX "notification_push_dispatch_jobs_status_availableAt_idx" ON "notification_push_dispatch_jobs"("status", "availableAt");
ALTER TABLE "notification_push_dispatch_jobs" ADD CONSTRAINT "notification_push_dispatch_jobs_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES (
  'cfeatureflag0streamchat001',
  'CHAT_ENABLED',
  false,
  'Enables Stream-backed 1:1 chat and metadata-only requests for users who have not accepted chat terms.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
