-- CreateEnum
CREATE TYPE "public"."ScheduleType" AS ENUM ('NEXT_AVAILABLE', 'ASSIGNED');

-- AlterTable
ALTER TABLE "public"."tournaments" ADD COLUMN "scheduleType" "public"."ScheduleType";
