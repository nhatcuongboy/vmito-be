CREATE TYPE "public"."ClassStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');
CREATE TYPE "public"."ClassTuitionPeriod" AS ENUM ('PER_SESSION', 'MONTHLY', 'COURSE', 'CONTACT');

ALTER TYPE "public"."FavoriteType" ADD VALUE 'CLASS';
ALTER TYPE "public"."NotificationType" ADD VALUE 'CLASS';

CREATE TABLE "public"."classes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "zaloUrl" TEXT,
    "hostId" TEXT NOT NULL,
    "sportType" "public"."SportType" NOT NULL DEFAULT 'BADMINTON',
    "requiredLevels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "capacity" INTEGER,
    "tuitionPeriod" "public"."ClassTuitionPeriod" NOT NULL DEFAULT 'CONTACT',
    "tuitionAmount" INTEGER,
    "tuitionNotes" TEXT,
    "venueId" TEXT,
    "customLocationName" TEXT,
    "customLocationAddress" TEXT,
    "customLocationPlaceId" TEXT,
    "customLocationLat" DOUBLE PRECISION,
    "customLocationLng" DOUBLE PRECISION,
    "customLocationDistrict" TEXT,
    "customLocationCity" TEXT,
    "coverPhoto" TEXT,
    "coverPhotoPublicId" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imagePublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchTerms" TEXT,
    "status" "public"."ClassStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."class_schedules" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classes_slug_key" ON "public"."classes"("slug");
CREATE INDEX "classes_hostId_idx" ON "public"."classes"("hostId");
CREATE INDEX "classes_status_idx" ON "public"."classes"("status");
CREATE INDEX "classes_sportType_idx" ON "public"."classes"("sportType");
CREATE INDEX "classes_venueId_idx" ON "public"."classes"("venueId");
CREATE INDEX "class_schedules_classId_idx" ON "public"."class_schedules"("classId");
CREATE INDEX "class_schedules_classId_isActive_idx" ON "public"."class_schedules"("classId", "isActive");

ALTER TABLE "public"."classes" ADD CONSTRAINT "classes_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."classes" ADD CONSTRAINT "classes_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."class_schedules" ADD CONSTRAINT "class_schedules_classId_fkey" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
