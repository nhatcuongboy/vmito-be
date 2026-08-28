-- CreateTable
CREATE TABLE "webview_sessions" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webview_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webview_sessions_codeHash_key" ON "webview_sessions"("codeHash");
CREATE INDEX "webview_sessions_userId_expiresAt_idx" ON "webview_sessions"("userId", "expiresAt");

ALTER TABLE "refresh_tokens" ADD COLUMN "webViewSessionId" TEXT;
CREATE INDEX "refresh_tokens_webViewSessionId_idx" ON "refresh_tokens"("webViewSessionId");

ALTER TABLE "webview_sessions" ADD CONSTRAINT "webview_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_webViewSessionId_fkey"
  FOREIGN KEY ("webViewSessionId") REFERENCES "webview_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
