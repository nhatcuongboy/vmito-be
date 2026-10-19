-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "autoCheckIn" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "players" ADD COLUMN "checkedInAt" TIMESTAMP(3);
