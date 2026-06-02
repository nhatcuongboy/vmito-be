CREATE TYPE "CategoryRegistrationMode" AS ENUM ('INDIVIDUAL', 'TEAM');

ALTER TABLE "categories"
ADD COLUMN "registrationMode" "CategoryRegistrationMode" NOT NULL DEFAULT 'TEAM',
ADD COLUMN "teamSize" INTEGER NOT NULL DEFAULT 2;

UPDATE "categories"
SET
  "registrationMode" = 'INDIVIDUAL',
  "teamSize" = 1
WHERE "type" IN ('MENS_SINGLE', 'WOMENS_SINGLE');

UPDATE "categories"
SET
  "registrationMode" = 'TEAM',
  "teamSize" = 2
WHERE "type" IN ('MENS_DOUBLE', 'WOMENS_DOUBLE', 'MIXED_DOUBLE', 'CUSTOM');
