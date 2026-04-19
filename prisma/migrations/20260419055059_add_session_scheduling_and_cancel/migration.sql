-- AlterEnum: Add CANCELLED to SessionStatus
ALTER TYPE "SessionStatus" ADD VALUE 'CANCELLED';

-- AlterTable: Add scheduling and notification tracking fields to Session
ALTER TABLE "sessions" ADD COLUMN "scheduledStartTime" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "scheduledEndTime" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "gracePeriodEnd" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "startReminderSentAt" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "endWarningSentAt" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- CreateIndex: Speed up cron queries that filter PREPARING sessions by scheduledStartTime
CREATE INDEX "sessions_status_scheduledStartTime_idx" ON "sessions"("status", "scheduledStartTime");

-- CreateIndex: Speed up cron queries that filter IN_PROGRESS sessions by scheduledEndTime
CREATE INDEX "sessions_status_scheduledEndTime_idx" ON "sessions"("status", "scheduledEndTime");
