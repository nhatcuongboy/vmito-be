-- Add socialLinks JSON column to Club table
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;
