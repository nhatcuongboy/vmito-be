-- Add socialLinks JSON column to the clubs table (Club model is @@map("clubs"))
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;
