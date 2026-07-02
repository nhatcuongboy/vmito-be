-- CreateTable
CREATE TABLE "level_definitions" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "level_definitions_code_key" ON "level_definitions"("code");

-- CreateIndex
CREATE INDEX "level_definitions_active_sortOrder_idx" ON "level_definitions"("active", "sortOrder");

-- Seed stable level IDs without changing existing player/session values.
INSERT INTO "level_definitions" (
    "id",
    "code",
    "shortLabel",
    "sortOrder",
    "active",
    "updatedAt"
) VALUES
    (9, 'Y_MINUS', 'Yếu-', 5, true, CURRENT_TIMESTAMP),
    (1, 'Y', 'Yếu', 10, true, CURRENT_TIMESTAMP),
    (10, 'Y_PLUS', 'Yếu+', 15, true, CURRENT_TIMESTAMP),
    (2, 'TBY', 'TBY', 20, true, CURRENT_TIMESTAMP),
    (3, 'TB_MINUS', 'TB-', 30, true, CURRENT_TIMESTAMP),
    (4, 'TB', 'TB', 40, true, CURRENT_TIMESTAMP),
    (5, 'TB_PLUS', 'TB+', 50, true, CURRENT_TIMESTAMP),
    (6, 'KHA', 'Khá', 60, true, CURRENT_TIMESTAMP),
    (7, 'BC', 'BC', 70, true, CURRENT_TIMESTAMP),
    (8, 'CN', 'CN', 80, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
    "code" = EXCLUDED."code",
    "shortLabel" = EXCLUDED."shortLabel",
    "sortOrder" = EXCLUDED."sortOrder",
    "active" = EXCLUDED."active",
    "updatedAt" = CURRENT_TIMESTAMP;
