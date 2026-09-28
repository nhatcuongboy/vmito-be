CREATE TYPE "DiscoveryFilterTab" AS ENUM ('sessions', 'venues', 'clubs', 'tournaments');

CREATE TABLE "saved_discovery_filters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tab" "DiscoveryFilterTab" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "normalizedName" VARCHAR(60) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_discovery_filters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_discovery_filters_userId_tab_normalizedName_key"
    ON "saved_discovery_filters"("userId", "tab", "normalizedName");
CREATE INDEX "saved_discovery_filters_userId_tab_updatedAt_idx"
    ON "saved_discovery_filters"("userId", "tab", "updatedAt");
ALTER TABLE "saved_discovery_filters"
    ADD CONSTRAINT "saved_discovery_filters_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
