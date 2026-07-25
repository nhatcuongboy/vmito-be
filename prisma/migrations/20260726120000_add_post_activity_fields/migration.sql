-- CreateEnum
CREATE TYPE "public"."PostType" AS ENUM ('USER', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "public"."PostVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('SESSION_CREATED', 'SESSION_RESULTS', 'CLUB_CREATED', 'CLUB_UPDATED', 'CLUB_MEMBER_JOINED', 'TOURNAMENT_CREATED', 'TOURNAMENT_FINISHED', 'AVATAR_UPDATED', 'USER_RATED');

-- AlterTable
ALTER TABLE "public"."posts" ADD COLUMN     "activityType" "public"."ActivityType",
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "type" "public"."PostType" NOT NULL DEFAULT 'USER',
ADD COLUMN     "visibility" "public"."PostVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateIndex
CREATE INDEX "posts_type_activityType_idx" ON "public"."posts"("type", "activityType");
