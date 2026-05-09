-- CreateTable
CREATE TABLE "schedule_configurations" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "categoryPriorities" JSONB NOT NULL,
    "matchDurations" JSONB NOT NULL,
    "keepScheduledMatches" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_time_slots" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timeBuffer" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_time_slots" (
    "id" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "constraints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_schedules" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "assignments" JSONB NOT NULL,
    "conflicts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_configurations_tournamentId_key" ON "schedule_configurations"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "court_time_slots_timeSlotId_courtId_key" ON "court_time_slots"("timeSlotId", "courtId");

-- CreateIndex
CREATE INDEX "generated_schedules_tournamentId_idx" ON "generated_schedules"("tournamentId");

-- CreateIndex
CREATE INDEX "generated_schedules_expiresAt_idx" ON "generated_schedules"("expiresAt");

-- AddForeignKey
ALTER TABLE "schedule_configurations" ADD CONSTRAINT "schedule_configurations_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_time_slots" ADD CONSTRAINT "schedule_time_slots_configId_fkey" FOREIGN KEY ("configId") REFERENCES "schedule_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_time_slots" ADD CONSTRAINT "court_time_slots_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "schedule_time_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_time_slots" ADD CONSTRAINT "court_time_slots_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "tournament_courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
