-- AlterTable
ALTER TABLE "public"."clubs" ADD COLUMN     "searchTerms" TEXT;

-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "searchTerms" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "searchTerms" TEXT;

-- AlterTable
ALTER TABLE "public"."venues" ADD COLUMN     "searchTerms" TEXT;
