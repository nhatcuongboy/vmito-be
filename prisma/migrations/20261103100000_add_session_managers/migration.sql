-- CreateEnum
CREATE TYPE "SessionPermission" AS ENUM ('COURTS', 'PLAYERS', 'FINANCE', 'SESSION');

-- AlterTable
ALTER TABLE "payment_records" ADD COLUMN     "approvedById" TEXT;

-- CreateTable
CREATE TABLE "session_managers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" "SessionPermission"[],
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_manager_invites" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "permissions" "SessionPermission"[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_manager_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_managers_userId_idx" ON "session_managers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_managers_sessionId_userId_key" ON "session_managers"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_manager_invites_codeHash_key" ON "session_manager_invites"("codeHash");

-- CreateIndex
CREATE INDEX "session_manager_invites_sessionId_idx" ON "session_manager_invites"("sessionId");

-- AddForeignKey
ALTER TABLE "session_managers" ADD CONSTRAINT "session_managers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_managers" ADD CONSTRAINT "session_managers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_manager_invites" ADD CONSTRAINT "session_manager_invites_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
