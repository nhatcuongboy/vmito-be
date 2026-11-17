-- CreateEnum
CREATE TYPE "public"."ShuttlecockFeatherType" AS ENUM ('DUCK', 'GOOSE', 'SYNTHETIC', 'HYBRID_3IN1');

-- CreateEnum
CREATE TYPE "public"."ShuttlecockCorkType" AS ENUM ('NATURAL', 'COMPOSITE', 'SANDWICH', 'FOAM');

-- CreateEnum
CREATE TYPE "public"."ShuttlecockSuitability" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'TOURNAMENT');

-- CreateTable
CREATE TABLE "public"."shuttlecocks" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vietnameseName" TEXT NOT NULL,
    "featuredImage" TEXT NOT NULL,
    "galleryImages" TEXT[],
    "featherType" "public"."ShuttlecockFeatherType" NOT NULL,
    "featherCount" INTEGER NOT NULL DEFAULT 16,
    "corkType" "public"."ShuttlecockCorkType" NOT NULL,
    "speedOptions" INTEGER[],
    "bwfApproved" BOOLEAN NOT NULL DEFAULT false,
    "suitability" "public"."ShuttlecockSuitability"[],
    "minTubePrice" INTEGER NOT NULL,
    "maxTubePrice" INTEGER NOT NULL,
    "minCartonPrice" INTEGER NOT NULL,
    "maxCartonPrice" INTEGER NOT NULL,
    "ratingOverall" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "ratingFlightStability" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "ratingDurability" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "ratingFeelAndImpact" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "totalReviews" INTEGER NOT NULL DEFAULT 1,
    "pros" TEXT[],
    "cons" TEXT[],
    "description" TEXT NOT NULL,
    "searchAliases" TEXT[],
    "searchTerms" TEXT,
    "affiliateStores" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shuttlecocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shuttlecocks_slug_key" ON "public"."shuttlecocks"("slug");

-- CreateIndex
CREATE INDEX "shuttlecocks_brand_idx" ON "public"."shuttlecocks"("brand");

-- CreateIndex
CREATE INDEX "shuttlecocks_featherType_idx" ON "public"."shuttlecocks"("featherType");

-- CreateIndex
CREATE INDEX "shuttlecocks_totalReviews_idx" ON "public"."shuttlecocks"("totalReviews");

