-- CreateTable
CREATE TABLE "public"."club_invites" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_invites_clubId_key" ON "public"."club_invites"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "club_invites_code_key" ON "public"."club_invites"("code");

-- AddForeignKey
ALTER TABLE "public"."club_invites" ADD CONSTRAINT "club_invites_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
