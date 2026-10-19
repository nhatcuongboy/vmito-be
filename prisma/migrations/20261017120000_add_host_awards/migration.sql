-- CreateEnum
CREATE TYPE "HostAwardPeriodStatus" AS ENUM ('PROVISIONAL', 'PENDING_REVIEW', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "HostAwardCategory" AS ENUM ('OVERALL', 'NEWCOMER_MAGNET', 'MOST_LOVED', 'MOST_RELIABLE', 'RISING_STAR');

-- CreateTable
CREATE TABLE "host_award_periods" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "status" "HostAwardPeriodStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "rulesVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_award_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_award_entries" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "category" "HostAwardCategory" NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "trustFactor" DOUBLE PRECISION NOT NULL,
    "metrics" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludedReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_award_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_award_sanctions" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_award_sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "host_award_periods_monthKey_key" ON "host_award_periods"("monthKey");

-- CreateIndex
CREATE INDEX "host_award_entries_hostId_idx" ON "host_award_entries"("hostId");

-- CreateIndex
CREATE INDEX "host_award_entries_periodId_category_rank_idx" ON "host_award_entries"("periodId", "category", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "host_award_entries_periodId_hostId_category_key" ON "host_award_entries"("periodId", "hostId", "category");

-- CreateIndex
CREATE INDEX "host_award_sanctions_hostId_idx" ON "host_award_sanctions"("hostId");

-- AddForeignKey
ALTER TABLE "host_award_entries" ADD CONSTRAINT "host_award_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "host_award_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_award_entries" ADD CONSTRAINT "host_award_entries_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_award_sanctions" ADD CONSTRAINT "host_award_sanctions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

