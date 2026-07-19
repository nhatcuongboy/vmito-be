import { BadRequestException, ConflictException } from '@nestjs/common';
import { VenueCourtStatus, VenueRentalSelectionMode } from '@prisma/client';
import { VenueCourtsService } from './venue-courts.service';

describe('VenueCourtsService', () => {
  const prisma = {
    venueCourt: { findMany: jest.fn() },
    venueOperatingPeriod: { findFirst: jest.fn() },
  };
  const pricing = {
    validateTimeRange: jest.fn(),
    getLocalDateKey: jest.fn(),
  };
  const service = new VenueCourtsService(
    prisma as never,
    {} as never,
    pricing as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('converts venue-local time to UTC', () => {
    expect(
      service.toUtc('2026-08-01', 18 * 60, 'Asia/Ho_Chi_Minh').toISOString()
    ).toBe('2026-08-01T11:00:00.000Z');
  });

  it('rejects overlapping weekly operating periods', () => {
    expect(() =>
      (
        service as unknown as {
          validatePeriods: (
            periods: Array<{
              dayOfWeek: number;
              startMinute: number;
              endMinute: number;
            }>
          ) => void;
        }
      ).validatePeriods([
        { dayOfWeek: 1, startMinute: 480, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 690, endMinute: 900 },
      ])
    ).toThrow(BadRequestException);
  });

  it('requires every selected Court to remain available', async () => {
    const tx = {
      venueCourt: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'court-1',
            status: VenueCourtStatus.ACTIVE,
          },
        ]),
      },
    };
    await expect(
      (
        service as unknown as {
          resolveCourts: (
            client: unknown,
            input: {
              venueId: string;
              startTime: Date;
              endTime: Date;
              numberOfCourts: number;
              selectionMode: VenueRentalSelectionMode;
              courtIds: string[];
            }
          ) => Promise<string[]>;
        }
      ).resolveCourts(tx, {
        venueId: 'venue-1',
        startTime: new Date('2026-08-01T10:00:00Z'),
        endTime: new Date('2026-08-01T11:00:00Z'),
        numberOfCourts: 2,
        selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
        courtIds: ['court-1', 'court-2'],
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
