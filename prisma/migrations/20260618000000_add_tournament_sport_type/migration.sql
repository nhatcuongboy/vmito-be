-- Existing tournaments are badminton tournaments by default.
CREATE TYPE "public"."SportType" AS ENUM ('BADMINTON', 'PICKLEBALL');

ALTER TABLE "public"."tournaments"
  ADD COLUMN "sportType" "public"."SportType" NOT NULL DEFAULT 'BADMINTON';

