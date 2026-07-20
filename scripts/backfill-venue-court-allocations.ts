/**
 * Allocate physical Courts to future confirmed Phase 2 rentals.
 *
 * Dry run: npx ts-node -r tsconfig-paths/register scripts/backfill-venue-court-allocations.ts
 * Apply:   npx ts-node -r tsconfig-paths/register scripts/backfill-venue-court-allocations.ts --apply
 */
import {
  PrismaClient,
  VenueCourtStatus,
  VenueRentalAllocationStatus,
  VenueRentalEventType,
  VenueRentalStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const rentals = await prisma.venueRentalRequest.findMany({
    where: {
      status: VenueRentalStatus.CONFIRMED,
      confirmedEndTime: { gt: new Date() },
      confirmedStartTime: { not: null },
      confirmedNumberOfCourts: { not: null },
      courtAllocations: {
        none: { status: VenueRentalAllocationStatus.CONFIRMED },
      },
    },
    orderBy: [
      { venueId: 'asc' },
      { confirmedStartTime: 'asc' },
      { confirmedEndTime: 'asc' },
    ],
  });

  let allocated = 0;
  let needsReview = 0;
  for (const rental of rentals) {
    const startTime = rental.confirmedStartTime!;
    const endTime = rental.confirmedEndTime!;
    const count = rental.confirmedNumberOfCourts!;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock_result',
        `${rental.venueId}:${startTime.toISOString().slice(0, 10)}`
      );
      const courts = await tx.venueCourt.findMany({
        where: {
          venueId: rental.venueId,
          status: VenueCourtStatus.ACTIVE,
          blocks: {
            none: { startTime: { lt: endTime }, endTime: { gt: startTime } },
          },
          allocations: {
            none: {
              status: VenueRentalAllocationStatus.CONFIRMED,
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          },
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        take: count,
      });
      if (courts.length < count) {
        if (apply) {
          await tx.venueRentalRequest.update({
            where: { id: rental.id },
            data: { allocationNeedsReview: true },
          });
        }
        return { success: false, courtIds: courts.map((court) => court.id) };
      }
      const courtIds = courts.map((court) => court.id);
      if (apply) {
        await tx.venueRentalCourtAllocation.createMany({
          data: courtIds.map((courtId) => ({
            venueId: rental.venueId,
            courtId,
            requestId: rental.id,
            startTime,
            endTime,
            status: VenueRentalAllocationStatus.CONFIRMED,
          })),
        });
        await tx.venueRentalRequest.update({
          where: { id: rental.id },
          data: {
            requestedCourtIds: courtIds,
            allocationNeedsReview: false,
          },
        });
        await tx.venueRentalEvent.create({
          data: {
            requestId: rental.id,
            type: VenueRentalEventType.COURTS_ALLOCATED,
            fromStatus: VenueRentalStatus.CONFIRMED,
            toStatus: VenueRentalStatus.CONFIRMED,
            payload: { courtIds, source: 'BACKFILL' },
          },
        });
      }
      return { success: true, courtIds };
    });
    if (result.success) allocated += 1;
    else needsReview += 1;
    console.log(
      `${result.success ? 'ALLOCATE' : 'REVIEW'} ${rental.id} -> ${result.courtIds.join(', ') || 'no courts'}`
    );
  }

  console.log(
    `${apply ? 'Applied' : 'Dry run'}: ${allocated} allocatable, ${needsReview} need review, ${rentals.length} total.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
