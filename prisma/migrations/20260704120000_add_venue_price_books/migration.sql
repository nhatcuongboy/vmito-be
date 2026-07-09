-- CreateEnum
CREATE TYPE "public"."VenueDayType" AS ENUM ('EVERYDAY', 'WEEKDAY', 'WEEKEND', 'HOLIDAY', 'SPECIFIC_DATE');

-- CreateEnum
CREATE TYPE "public"."VenueCustomerType" AS ENUM ('FIXED', 'WALK_IN', 'STUDENT', 'MEMBER', 'CUSTOM');

-- CreateTable
CREATE TABLE "public"."venue_price_books" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "priceImageUrl" TEXT,
    "priceImagePublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_price_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."venue_price_rules" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "dayType" "public"."VenueDayType" NOT NULL,
    "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "specificDate" TIMESTAMP(3),
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "customerType" "public"."VenueCustomerType" NOT NULL,
    "pricePerHour" INTEGER NOT NULL,
    "minimumMinutes" INTEGER,
    "billingStepMinutes" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_price_books_venueId_idx" ON "public"."venue_price_books"("venueId");

-- CreateIndex
CREATE INDEX "venue_price_books_isActive_idx" ON "public"."venue_price_books"("isActive");

-- CreateIndex
CREATE INDEX "venue_price_books_effectiveFrom_effectiveTo_idx" ON "public"."venue_price_books"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "venue_price_rules_priceBookId_idx" ON "public"."venue_price_rules"("priceBookId");

-- CreateIndex
CREATE INDEX "venue_price_rules_dayType_idx" ON "public"."venue_price_rules"("dayType");

-- CreateIndex
CREATE INDEX "venue_price_rules_customerType_idx" ON "public"."venue_price_rules"("customerType");

-- AddForeignKey
ALTER TABLE "public"."venue_price_books" ADD CONSTRAINT "venue_price_books_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "public"."venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."venue_price_rules" ADD CONSTRAINT "venue_price_rules_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "public"."venue_price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy venue hourly rates into default price books.
INSERT INTO "public"."venue_price_books" (
    "id",
    "venueId",
    "name",
    "currency",
    "effectiveFrom",
    "isActive",
    "priority",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    'vpb_' || replace(gen_random_uuid()::text, '-', ''),
    v."id",
    'Bảng giá mặc định',
    'VND',
    '1970-01-01 00:00:00'::timestamp,
    true,
    0,
    'Tự động tạo từ giá thuê cố định/vãng lai cũ',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."venues" v
WHERE v."hourlyRateFixed" IS NOT NULL OR v."hourlyRateWalkIn" IS NOT NULL;

INSERT INTO "public"."venue_price_rules" (
    "id",
    "priceBookId",
    "dayType",
    "daysOfWeek",
    "startMinute",
    "endMinute",
    "customerType",
    "pricePerHour",
    "priority",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    'vpr_' || replace(gen_random_uuid()::text, '-', ''),
    pb."id",
    'EVERYDAY'::"public"."VenueDayType",
    ARRAY[]::INTEGER[],
    0,
    1440,
    'FIXED'::"public"."VenueCustomerType",
    v."hourlyRateFixed",
    0,
    'Tự động tạo từ hourlyRateFixed',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."venue_price_books" pb
JOIN "public"."venues" v ON v."id" = pb."venueId"
WHERE pb."notes" = 'Tự động tạo từ giá thuê cố định/vãng lai cũ'
  AND v."hourlyRateFixed" IS NOT NULL;

INSERT INTO "public"."venue_price_rules" (
    "id",
    "priceBookId",
    "dayType",
    "daysOfWeek",
    "startMinute",
    "endMinute",
    "customerType",
    "pricePerHour",
    "priority",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    'vpr_' || replace(gen_random_uuid()::text, '-', ''),
    pb."id",
    'EVERYDAY'::"public"."VenueDayType",
    ARRAY[]::INTEGER[],
    0,
    1440,
    'WALK_IN'::"public"."VenueCustomerType",
    v."hourlyRateWalkIn",
    0,
    'Tự động tạo từ hourlyRateWalkIn',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."venue_price_books" pb
JOIN "public"."venues" v ON v."id" = pb."venueId"
WHERE pb."notes" = 'Tự động tạo từ giá thuê cố định/vãng lai cũ'
  AND v."hourlyRateWalkIn" IS NOT NULL;
