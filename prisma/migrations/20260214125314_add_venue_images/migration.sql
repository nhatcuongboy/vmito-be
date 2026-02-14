-- AlterTable
ALTER TABLE "public"."venues" ADD COLUMN     "coverPhoto" TEXT,
ADD COLUMN     "coverPhotoPublicId" TEXT,
ADD COLUMN     "imagePublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
