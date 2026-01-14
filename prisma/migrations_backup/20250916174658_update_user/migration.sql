-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "gender" "public"."Gender",
ADD COLUMN     "level" "public"."Level",
ADD COLUMN     "levelDescription" TEXT,
ADD COLUMN     "phone" TEXT;
