/*
  Warnings:

  - Added the required column `updatedAt` to the `fixed_member_group_members` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."ClubJoinPolicy" AS ENUM ('OPEN', 'APPROVAL_REQUIRED', 'INVITATION_ONLY');

-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('ADMIN', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."MemberStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "public"."fixed_member_group_members" ADD COLUMN     "attendanceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttendedAt" TIMESTAMP(3),
ADD COLUMN     "role" "public"."MemberRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "status" "public"."MemberStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have updatedAt = createdAt
UPDATE "public"."fixed_member_group_members" SET "updatedAt" = "createdAt" WHERE "updatedAt" = CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."fixed_member_groups" ADD COLUMN     "image" TEXT,
ADD COLUMN     "imagePublicId" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinPolicy" "public"."ClubJoinPolicy" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
ADD COLUMN     "location" TEXT,
ADD COLUMN     "maxMembers" INTEGER,
ADD COLUMN     "sessionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPlayersServed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."club_join_requests" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."club_announcements" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinnedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."club_sessions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attendanceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_join_requests_groupId_idx" ON "public"."club_join_requests"("groupId");

-- CreateIndex
CREATE INDEX "club_join_requests_userId_idx" ON "public"."club_join_requests"("userId");

-- CreateIndex
CREATE INDEX "club_join_requests_status_idx" ON "public"."club_join_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "club_join_requests_groupId_userId_key" ON "public"."club_join_requests"("groupId", "userId");

-- CreateIndex
CREATE INDEX "club_announcements_groupId_idx" ON "public"."club_announcements"("groupId");

-- CreateIndex
CREATE INDEX "club_announcements_authorId_idx" ON "public"."club_announcements"("authorId");

-- CreateIndex
CREATE INDEX "club_announcements_pinnedUntil_idx" ON "public"."club_announcements"("pinnedUntil");

-- CreateIndex
CREATE INDEX "club_sessions_groupId_idx" ON "public"."club_sessions"("groupId");

-- CreateIndex
CREATE INDEX "club_sessions_sessionId_idx" ON "public"."club_sessions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "club_sessions_groupId_sessionId_key" ON "public"."club_sessions"("groupId", "sessionId");

-- CreateIndex
CREATE INDEX "fixed_member_group_members_role_idx" ON "public"."fixed_member_group_members"("role");

-- CreateIndex
CREATE INDEX "fixed_member_group_members_status_idx" ON "public"."fixed_member_group_members"("status");

-- CreateIndex
CREATE INDEX "fixed_member_groups_isPublic_idx" ON "public"."fixed_member_groups"("isPublic");

-- AddForeignKey
ALTER TABLE "public"."club_join_requests" ADD CONSTRAINT "club_join_requests_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."fixed_member_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_join_requests" ADD CONSTRAINT "club_join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_announcements" ADD CONSTRAINT "club_announcements_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."fixed_member_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_announcements" ADD CONSTRAINT "club_announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_sessions" ADD CONSTRAINT "club_sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."fixed_member_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."club_sessions" ADD CONSTRAINT "club_sessions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
