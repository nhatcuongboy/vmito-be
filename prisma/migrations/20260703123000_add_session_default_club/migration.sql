-- Add an optional default club for sessions. This lets a session inherit
-- club-member fee behavior while keeping existing sessions unchanged.
ALTER TABLE "sessions" ADD COLUMN "clubId" TEXT;

CREATE INDEX "sessions_clubId_idx" ON "sessions"("clubId");

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "clubs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
