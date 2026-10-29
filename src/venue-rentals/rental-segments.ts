import { Prisma } from '@prisma/client';
import type { RentalSegment } from './venue-pricing.service';

/**
 * Reads `VenueRentalQuote.segments` / `VenueRentalRequest.confirmedSegments`.
 * Null for classic single-range rentals, which keep using startTime/endTime.
 */
export function readRentalSegments(
  value: Prisma.JsonValue | null | undefined
): RentalSegment[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const segment = item as Record<string, unknown>;
    if (
      typeof segment.startTime !== 'string' ||
      typeof segment.endTime !== 'string' ||
      !Array.isArray(segment.courtIds)
    ) {
      return [];
    }
    const courtIds = segment.courtIds.filter(
      (id): id is string => typeof id === 'string'
    );
    return [
      {
        startTime: segment.startTime,
        endTime: segment.endTime,
        courtIds,
        numberOfCourts: courtIds.length,
        amount: typeof segment.amount === 'number' ? segment.amount : 0,
        priceBookId:
          typeof segment.priceBookId === 'string' ? segment.priceBookId : null,
      },
    ];
  });
}
