-- CreateEnum
CREATE TYPE "VenueReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "averageRating" DOUBLE PRECISION,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "venue_reviews" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "VenueReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_reviews_venueId_status_createdAt_idx" ON "venue_reviews"("venueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "venue_reviews_status_createdAt_idx" ON "venue_reviews"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "venue_reviews_venueId_userId_key" ON "venue_reviews"("venueId", "userId");

-- AddForeignKey
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

