-- CreateTable
CREATE TABLE "session_expenses" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_expenses_sessionId_idx" ON "session_expenses"("sessionId");

-- AddForeignKey
ALTER TABLE "session_expenses" ADD CONSTRAINT "session_expenses_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
