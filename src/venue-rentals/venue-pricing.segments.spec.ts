import { BadRequestException } from '@nestjs/common';
import { VenueCustomerType, VenueDayType } from '@prisma/client';
import { VenuePricingService } from './venue-pricing.service';

describe('VenuePricingService.calculateSegments', () => {
  const prisma = { venue: { findUnique: jest.fn() } };
  const service = new VenuePricingService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      timezone: 'Asia/Ho_Chi_Minh',
      numberOfCourts: 4,
      hourlyRateFixed: null,
      hourlyRateWalkIn: null,
      priceBooks: [
        {
          id: 'book-1',
          currency: 'VND',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          courts: [],
          rules: [
            {
              id: 'rule-1',
              dayType: VenueDayType.EVERYDAY,
              daysOfWeek: [],
              specificDate: null,
              startMinute: 0,
              endMinute: 1440,
              customerType: VenueCustomerType.WALK_IN,
              pricePerHour: 100000,
              minimumMinutes: null,
              billingStepMinutes: null,
              priority: 0,
            },
          ],
        },
      ],
    });
  });

  it('prices each segment on its own courts and returns the envelope', async () => {
    const result = await service.calculateSegments('venue-1', {
      customerType: VenueCustomerType.WALK_IN,
      segments: [
        // Out of order on purpose: segments come back sorted by start.
        {
          startTime: '2026-08-01T19:00:00+07:00',
          endTime: '2026-08-01T20:00:00+07:00',
          courtIds: ['court-3'],
        },
        {
          startTime: '2026-08-01T17:00:00+07:00',
          endTime: '2026-08-01T18:30:00+07:00',
          courtIds: ['court-1', 'court-2'],
        },
      ],
    });

    expect(result.segments.map((s) => s.amount)).toEqual([300000, 100000]);
    expect(result.totalAmount).toBe(400000);
    expect(result.startTime.toISOString()).toBe('2026-08-01T10:00:00.000Z');
    expect(result.endTime.toISOString()).toBe('2026-08-01T13:00:00.000Z');
    expect(result.courtIds).toEqual(['court-1', 'court-2', 'court-3']);
    expect(result.breakdown.map((item) => item.segmentIndex)).toEqual([0, 1]);
  });

  it('rejects segments overlapping on the same court', async () => {
    await expect(
      service.calculateSegments('venue-1', {
        customerType: VenueCustomerType.WALK_IN,
        segments: [
          {
            startTime: '2026-08-01T17:00:00+07:00',
            endTime: '2026-08-01T18:30:00+07:00',
            courtIds: ['court-1'],
          },
          {
            startTime: '2026-08-01T18:00:00+07:00',
            endTime: '2026-08-01T19:00:00+07:00',
            courtIds: ['court-1'],
          },
        ],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows back-to-back segments on the same court', async () => {
    const result = await service.calculateSegments('venue-1', {
      customerType: VenueCustomerType.WALK_IN,
      segments: [
        {
          startTime: '2026-08-01T17:00:00+07:00',
          endTime: '2026-08-01T18:00:00+07:00',
          courtIds: ['court-1'],
        },
        {
          startTime: '2026-08-01T18:00:00+07:00',
          endTime: '2026-08-01T19:00:00+07:00',
          courtIds: ['court-1', 'court-2'],
        },
      ],
    });
    expect(result.totalAmount).toBe(300000);
  });

  it('rejects segments on different local days', async () => {
    await expect(
      service.calculateSegments('venue-1', {
        customerType: VenueCustomerType.WALK_IN,
        segments: [
          {
            startTime: '2026-08-01T17:00:00+07:00',
            endTime: '2026-08-01T18:00:00+07:00',
            courtIds: ['court-1'],
          },
          {
            startTime: '2026-08-02T17:00:00+07:00',
            endTime: '2026-08-02T18:00:00+07:00',
            courtIds: ['court-2'],
          },
        ],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
