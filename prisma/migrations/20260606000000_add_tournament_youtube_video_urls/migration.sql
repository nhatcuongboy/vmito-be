ALTER TABLE "public"."tournaments"
ADD COLUMN "youtubeVideoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
