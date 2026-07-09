-- CreateEnum
CREATE TYPE "public"."FavoriteType" AS ENUM ('SESSION', 'VENUE', 'CLUB', 'TOURNAMENT');

-- CreateTable
CREATE TABLE "public"."favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."FavoriteType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorites_userId_type_idx" ON "public"."favorites"("userId", "type");

-- CreateIndex
CREATE INDEX "favorites_type_targetId_idx" ON "public"."favorites"("type", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_type_targetId_key" ON "public"."favorites"("userId", "type", "targetId");

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
