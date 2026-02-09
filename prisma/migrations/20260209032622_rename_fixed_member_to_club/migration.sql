/*
  Warnings:

  - You are about to drop the column `groupId` on the `club_announcements` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `club_join_requests` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `club_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `fixedMemberFeeApplied` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `fixedMemberGroupId` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `isFixedMember` on the `players` table. All the data in the column will be lost.
  - You are about to drop the `fixed_member_group_fee_configs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fixed_member_group_members` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fixed_member_groups` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[clubId,userId]` on the table `club_join_requests` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clubId,sessionId]` on the table `club_sessions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clubId` to the `club_announcements` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clubId` to the `club_join_requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clubId` to the `club_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."club_announcements" DROP CONSTRAINT "club_announcements_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."club_join_requests" DROP CONSTRAINT "club_join_requests_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."club_sessions" DROP CONSTRAINT "club_sessions_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."fixed_member_group_fee_configs" DROP CONSTRAINT "fixed_member_group_fee_configs_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."fixed_member_group_members" DROP CONSTRAINT "fixed_member_group_members_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."fixed_member_group_members" DROP CONSTRAINT "fixed_member_group_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."fixed_member_groups" DROP CONSTRAINT "fixed_member_groups_hostId_fkey";

-- DropForeignKey
ALTER TABLE "public"."players" DROP CONSTRAINT "players_fixedMemberGroupId_fkey";

-- DropIndex
DROP INDEX "public"."club_announcements_groupId_idx";

-- DropIndex
DROP INDEX "public"."club_join_requests_groupId_idx";

-- DropIndex
DROP INDEX "public"."club_join_requests_groupId_userId_key";

-- DropIndex
DROP INDEX "public"."club_sessions_groupId_idx";

-- DropIndex
DROP INDEX "public"."club_sessions_groupId_sessionId_key";

-- DropIndex
DROP INDEX "public"."players_fixedMemberGroupId_idx";

-- AlterTable
ALTER TABLE "public"."club_announcements" DROP COLUMN "groupId",
ADD COLUMN     "clubId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."club_join_requests" DROP COLUMN "groupId",
ADD COLUMN     "clubId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."club_sessions" DROP COLUMN "groupId",
ADD COLUMN     "clubId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."players" DROP COLUMN "fixedMemberFeeApplied",
DROP COLUMN "fixedMemberGroupId",
DROP COLUMN "isFixedMember",
ADD COLUMN     "clubFeeApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "isClubMember" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "public"."fixed_member_group_fee_configs";

-- DropTable
DROP TABLE "public"."fixed_member_group_members";

-- DropTable
DROP TABLE "public"."fixed_member_groups";

-- CreateTable
CREATE TABLE "public"."clubs" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "joinPolicy" "public"."ClubJoinPolicy" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "maxMembers" INTEGER,
    "image" TEXT,
    "imagePublicId" TEXT,
    "location" TEXT,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "totalPlayersServed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."club_members" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "public"."MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "attendanceCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."club_fee_configs" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "maleFeeMonthly" INTEGER,
    "femaleFeeMonthly" INTEGER,
    "maleFeePerSession" INTEGER,
    "femaleFeePerSession" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clubs_hostId_idx" ON "public"."clubs"("hostId");

-- CreateIndex
CREATE INDEX "clubs_isPublic_idx" ON "public"."clubs"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_hostId_name_key" ON "public"."clubs"("hostId", "name");

-- CreateIndex
CREATE INDEX "club_members_userId_idx" ON "public"."club_members"("userId");

-- CreateIndex
CREATE INDEX "club_members_clubId_idx" ON "public"."club_members"("clubId");

-- CreateIndex
CREATE INDEX "club_members_role_idx" ON "public"."club_members"("role");

-- CreateIndex
CREATE INDEX "club_members_status_idx" ON "public"."club_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "club_members_clubId_userId_key" ON "public"."club_members"("clubId", "userId");

-- CreateIndex
CREATE INDEX "club_fee_configs_clubId_idx" ON "public"."club_fee_configs"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "club_fee_configs_clubId_month_year_key" ON "public"."club_fee_configs"("clubId", "month", "year");

-- CreateIndex
CREATE INDEX "club_announcements_clubId_idx" ON "public"."club_announcements"("clubId");

-- CreateIndex
CREATE INDEX "club_join_requests_clubId_idx" ON "public"."club_join_requests"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "club_join_requests_clubId_userId_key" ON "public"."club_join_requests"("clubId", "userId");

-- CreateIndex
CREATE INDEX "club_sessions_clubId_idx" ON "public"."club_sessions"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "club_sessions_clubId_sessionId_key" ON "public"."club_sessions"("clubId", "sessionId");

-- CreateIndex
CREATE INDEX "players_clubId_idx" ON "public"."players"("clubId");

-- AddForeignKey
ALTER TABLE "public"."players" ADD CONSTRAINT "players_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clubs" ADD CONSTRAINT "clubs_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_members" ADD CONSTRAINT "club_members_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_members" ADD CONSTRAINT "club_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_fee_configs" ADD CONSTRAINT "club_fee_configs_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_join_requests" ADD CONSTRAINT "club_join_requests_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_announcements" ADD CONSTRAINT "club_announcements_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_sessions" ADD CONSTRAINT "club_sessions_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
