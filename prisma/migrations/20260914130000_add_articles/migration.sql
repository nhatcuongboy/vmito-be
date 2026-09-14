-- CreateEnum
CREATE TYPE "public"."ArticleCategory" AS ENUM ('NEWS', 'TUTORIAL', 'TOURNAMENT', 'EQUIPMENT', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "public"."ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "public"."articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "translationGroupId" TEXT,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "coverImage" TEXT,
    "coverImagePublicId" TEXT,
    "category" "public"."ArticleCategory" NOT NULL DEFAULT 'NEWS',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "public"."ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "readingTimeMinutes" INTEGER NOT NULL DEFAULT 1,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "public"."articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_locale_publishedAt_idx" ON "public"."articles"("status", "locale", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_status_category_publishedAt_idx" ON "public"."articles"("status", "category", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_status_isFeatured_publishedAt_idx" ON "public"."articles"("status", "isFeatured", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_translationGroupId_idx" ON "public"."articles"("translationGroupId");

-- CreateIndex
CREATE INDEX "articles_authorId_idx" ON "public"."articles"("authorId");

-- AddForeignKey
ALTER TABLE "public"."articles" ADD CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
