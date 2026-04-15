/*
  Warnings:

  - The values [CUSTOM] on the enum `CategoryType` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."ImageCategory" AS ENUM ('SESSION_COVER', 'AVATAR', 'CLUB', 'QR_CODE', 'PAYMENT_PROOF', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."CategoryType_new" AS ENUM ('MENS_SINGLE', 'WOMENS_SINGLE', 'MENS_DOUBLE', 'WOMENS_DOUBLE', 'MIXED_DOUBLE');
ALTER TABLE "public"."categories" ALTER COLUMN "type" TYPE "public"."CategoryType_new" USING ("type"::text::"public"."CategoryType_new");
ALTER TABLE "public"."tournament_pairs" ALTER COLUMN "type" TYPE "public"."CategoryType_new" USING ("type"::text::"public"."CategoryType_new");
ALTER TYPE "public"."CategoryType" RENAME TO "CategoryType_old";
ALTER TYPE "public"."CategoryType_new" RENAME TO "CategoryType";
DROP TYPE "public"."CategoryType_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "imagePublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "public"."user_images" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "originalName" TEXT,
    "format" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "category" "public"."ImageCategory" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_images_userId_idx" ON "public"."user_images"("userId");

-- CreateIndex
CREATE INDEX "user_images_userId_category_idx" ON "public"."user_images"("userId", "category");

-- AddForeignKey
ALTER TABLE "public"."user_images" ADD CONSTRAINT "user_images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
