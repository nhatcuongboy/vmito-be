-- Migration: add_created_by_user_id_to_player
ALTER TABLE "public"."players" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

-- Migration: add_fee_payment_models

-- CreateEnum (only if not exists)
DO $$ BEGIN
 CREATE TYPE "public"."FeeType" AS ENUM ('FIXED', 'SPLIT_EVENLY');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateTable session_fee_configs
CREATE TABLE IF NOT EXISTS "public"."session_fee_configs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "feeType" "public"."FeeType" NOT NULL,
    "maleFee" INTEGER,
    "femaleFee" INTEGER,
    "splitTotal" INTEGER,
    "splitPerPlayer" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable host_payment_settings
CREATE TABLE IF NOT EXISTS "public"."host_payment_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "accountHolderName" TEXT,
    "qrCodeUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable payment_records
CREATE TABLE IF NOT EXISTS "public"."payment_records" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "registeredByUserId" TEXT,
    "hostId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "public"."PaymentMethod",
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "proofImageUrl" TEXT,
    "proofNotes" TEXT,
    "hostNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "session_fee_configs_sessionId_key" ON "public"."session_fee_configs"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "host_payment_settings_userId_idx" ON "public"."host_payment_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_records_playerId_key" ON "public"."payment_records"("playerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_records_sessionId_idx" ON "public"."payment_records"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_records_hostId_idx" ON "public"."payment_records"("hostId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_records_registeredByUserId_idx" ON "public"."payment_records"("registeredByUserId");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "public"."session_fee_configs" ADD CONSTRAINT "session_fee_configs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."host_payment_settings" ADD CONSTRAINT "host_payment_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."payment_records" ADD CONSTRAINT "payment_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."payment_records" ADD CONSTRAINT "payment_records_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."payment_records" ADD CONSTRAINT "payment_records_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."payment_records" ADD CONSTRAINT "payment_records_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
