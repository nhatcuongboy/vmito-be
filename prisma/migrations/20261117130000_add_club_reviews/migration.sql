-- CreateEnum
CREATE TYPE "ClubReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "averageRating" DOUBLE PRECISION,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "club_reviews" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ClubReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_reviews_clubId_status_createdAt_idx" ON "club_reviews"("clubId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "club_reviews_status_createdAt_idx" ON "club_reviews"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "club_reviews_clubId_userId_key" ON "club_reviews"("clubId", "userId");

-- AddForeignKey
ALTER TABLE "club_reviews" ADD CONSTRAINT "club_reviews_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_reviews" ADD CONSTRAINT "club_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

