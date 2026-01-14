-- AlterTable
ALTER TABLE "public"."sessions" ADD COLUMN     "requiredLevels" "public"."Level"[] DEFAULT ARRAY[]::"public"."Level"[];
