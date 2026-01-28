-- CreateEnum
CREATE TYPE "public"."RatingType" AS ENUM ('PLAYER_TO_HOST', 'HOST_TO_PLAYER');

-- CreateTable
CREATE TABLE "public"."ratings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "ratedUserId" TEXT NOT NULL,
    "type" "public"."RatingType" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ratings_ratedUserId_idx" ON "public"."ratings"("ratedUserId");

-- CreateIndex
CREATE INDEX "ratings_raterUserId_idx" ON "public"."ratings"("raterUserId");

-- CreateIndex
CREATE INDEX "ratings_sessionId_idx" ON "public"."ratings"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_sessionId_raterUserId_ratedUserId_type_key" ON "public"."ratings"("sessionId", "raterUserId", "ratedUserId", "type");

-- AddForeignKey
ALTER TABLE "public"."ratings" ADD CONSTRAINT "ratings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ratings" ADD CONSTRAINT "ratings_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ratings" ADD CONSTRAINT "ratings_ratedUserId_fkey" FOREIGN KEY ("ratedUserId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
