-- AlterTable
ALTER TABLE "public"."players" ADD COLUMN     "fixedMemberFeeApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fixedMemberGroupId" TEXT,
ADD COLUMN     "isFixedMember" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."fixed_member_groups" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_member_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fixed_member_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_member_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fixed_member_group_fee_configs" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "maleFeeMonthly" INTEGER,
    "femaleFeeMonthly" INTEGER,
    "maleFeePerSession" INTEGER,
    "femaleFeePerSession" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_member_group_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixed_member_groups_hostId_idx" ON "public"."fixed_member_groups"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_member_groups_hostId_name_key" ON "public"."fixed_member_groups"("hostId", "name");

-- CreateIndex
CREATE INDEX "fixed_member_group_members_userId_idx" ON "public"."fixed_member_group_members"("userId");

-- CreateIndex
CREATE INDEX "fixed_member_group_members_groupId_idx" ON "public"."fixed_member_group_members"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_member_group_members_groupId_userId_key" ON "public"."fixed_member_group_members"("groupId", "userId");

-- CreateIndex
CREATE INDEX "fixed_member_group_fee_configs_groupId_idx" ON "public"."fixed_member_group_fee_configs"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_member_group_fee_configs_groupId_month_year_key" ON "public"."fixed_member_group_fee_configs"("groupId", "month", "year");

-- CreateIndex
CREATE INDEX "players_fixedMemberGroupId_idx" ON "public"."players"("fixedMemberGroupId");

-- AddForeignKey
ALTER TABLE "public"."players" ADD CONSTRAINT "players_fixedMemberGroupId_fkey" FOREIGN KEY ("fixedMemberGroupId") REFERENCES "public"."fixed_member_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fixed_member_groups" ADD CONSTRAINT "fixed_member_groups_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fixed_member_group_members" ADD CONSTRAINT "fixed_member_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."fixed_member_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fixed_member_group_members" ADD CONSTRAINT "fixed_member_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fixed_member_group_fee_configs" ADD CONSTRAINT "fixed_member_group_fee_configs_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."fixed_member_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
