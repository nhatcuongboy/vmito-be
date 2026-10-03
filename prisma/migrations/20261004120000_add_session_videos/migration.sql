-- Match recordings ("Clip trận đấu") a host links to a session.
CREATE TABLE "session_videos" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" VARCHAR(100),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_videos_sessionId_createdAt_idx"
    ON "session_videos"("sessionId", "createdAt");
ALTER TABLE "session_videos"
    ADD CONSTRAINT "session_videos_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
