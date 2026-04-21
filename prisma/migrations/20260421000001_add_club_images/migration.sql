-- AlterTable
ALTER TABLE "clubs" ADD COLUMN "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "imagePublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
