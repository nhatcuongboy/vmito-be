-- CreateEnum
CREATE TYPE "public"."PaymentReminderType" AS ENUM ('SINGLE_PAYMENT', 'AGGREGATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."PaymentReminderStatus" AS ENUM ('PENDING', 'AWAITING_CONFIRMATION', 'RESOLVED');

-- CreateTable
CREATE TABLE "public"."payment_reminders" (
    "id" TEXT NOT NULL,
    "type" "public"."PaymentReminderType" NOT NULL,
    "creatorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "status" "public"."PaymentReminderStatus" NOT NULL DEFAULT 'PENDING',
    "reminderCount" INTEGER NOT NULL DEFAULT 1,
    "lastRemindedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "proofImageUrl" TEXT,
    "proofImagePublicId" TEXT,
    "proofNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_reminder_payments" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,

    CONSTRAINT "payment_reminder_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reminders_creatorId_status_idx" ON "public"."payment_reminders"("creatorId", "status");

-- CreateIndex
CREATE INDEX "payment_reminders_recipientId_status_idx" ON "public"."payment_reminders"("recipientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reminder_payments_reminderId_paymentId_key" ON "public"."payment_reminder_payments"("reminderId", "paymentId");

-- CreateIndex
CREATE INDEX "payment_reminder_payments_paymentId_idx" ON "public"."payment_reminder_payments"("paymentId");

-- AddForeignKey
ALTER TABLE "public"."payment_reminders" ADD CONSTRAINT "payment_reminders_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_reminders" ADD CONSTRAINT "payment_reminders_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_reminders" ADD CONSTRAINT "payment_reminders_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_reminder_payments" ADD CONSTRAINT "payment_reminder_payments_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "public"."payment_reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_reminder_payments" ADD CONSTRAINT "payment_reminder_payments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."payment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
