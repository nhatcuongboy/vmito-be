-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('SINGLES', 'DOUBLES');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "defaultMatchType" "MatchType" NOT NULL DEFAULT 'DOUBLES';
