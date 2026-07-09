-- CreateTable
CREATE TABLE "club_monthly_members" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_monthly_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_monthly_members_clubId_userId_month_year_key" ON "club_monthly_members"("clubId", "userId", "month", "year");

-- CreateIndex
CREATE INDEX "club_monthly_members_clubId_month_year_idx" ON "club_monthly_members"("clubId", "month", "year");

-- CreateIndex
CREATE INDEX "club_monthly_members_userId_idx" ON "club_monthly_members"("userId");

-- AddForeignKey
ALTER TABLE "club_monthly_members" ADD CONSTRAINT "club_monthly_members_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_monthly_members" ADD CONSTRAINT "club_monthly_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
