import { BadRequestException, ConflictException } from '@nestjs/common';
import { VenueCustomerType, VenueDayType } from '@prisma/client';
import { VenuePricingService } from './venue-pricing.service';

describe('VenuePricingService', () => {
  const prisma = { venue: { findUnique: jest.fn() } };
  const service = new VenuePricingService(prisma as never);
  const baseVenue = {
    id: 'venue-1',
    timezone: 'Asia/Ho_Chi_Minh',
    numberOfCourts: 4,
    hourlyRateFixed: 90000,
    hourlyRateWalkIn: 100000,
    priceBooks: [],
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses a matching price rule and court count', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      ...baseVenue,
      priceBooks: [
        {
          id: 'book-1',
          currency: 'VND',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          rules: [
            {
              id: 'rule-1',
              dayType: VenueDayType.EVERYDAY,
              daysOfWeek: [],
              specificDate: null,
              startMinute: 0,
              endMinute: 1440,
              customerType: VenueCustomerType.WALK_IN,
              pricePerHour: 120000,
              minimumMinutes: null,
              billingStepMinutes: null,
              priority: 0,
            },
          ],
        },
      ],
    });

    const result = await service.calculate('venue-1', {
      startTime: '2026-08-01T18:00:00+07:00',
      endTime: '2026-08-01T20:00:00+07:00',
      numberOfCourts: 2,
      customerType: VenueCustomerType.WALK_IN,
    });

    expect(result.totalAmount).toBe(480000);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].ruleId).toBe('rule-1');
  });

  it('splits calculation across price boundaries', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      ...baseVenue,
      priceBooks: [
        {
          id: 'book-1',
          currency: 'VND',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          rules: [
            {
              id: 'rule-1',
              dayType: VenueDayType.EVERYDAY,
              daysOfWeek: [],
              specificDate: null,
              startMinute: 600,
              endMinute: 960,
              customerType: VenueCustomerType.WALK_IN,
              pricePerHour: 80000,
              minimumMinutes: null,
              billingStepMinutes: null,
              priority: 0,
            },
            {
              id: 'rule-2',
              dayType: VenueDayType.EVERYDAY,
              daysOfWeek: [],
              specificDate: null,
              startMinute: 960,
              endMinute: 1380,
              customerType: VenueCustomerType.WALK_IN,
              pricePerHour: 120000,
              minimumMinutes: null,
              billingStepMinutes: null,
              priority: 0,
            },
          ],
        },
      ],
    });

    const result = await service.calculate('venue-1', {
      startTime: '2026-08-01T15:00:00+07:00',
      endTime: '2026-08-01T17:00:00+07:00',
      numberOfCourts: 1,
      customerType: VenueCustomerType.WALK_IN,
    });

    expect(result.totalAmount).toBe(200000);
    expect(result.breakdown.map((item) => item.ruleId)).toEqual([
      'rule-1',
      'rule-2',
    ]);
  });

  it('falls back to the legacy walk-in rate', async () => {
    prisma.venue.findUnique.mockResolvedValue(baseVenue);
    const result = await service.calculate('venue-1', {
      startTime: '2026-08-01T18:00:00+07:00',
      endTime: '2026-08-01T19:00:00+07:00',
      numberOfCourts: 1,
      customerType: VenueCustomerType.WALK_IN,
    });
    expect(result.totalAmount).toBe(100000);
    expect(result.breakdown[0].source).toBe('LEGACY');
  });

  it('returns PRICING_UNAVAILABLE when no price covers the range', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      ...baseVenue,
      hourlyRateFixed: null,
      hourlyRateWalkIn: null,
    });
    await expect(
      service.calculate('venue-1', {
        startTime: '2026-08-01T18:00:00+07:00',
        endTime: '2026-08-01T19:00:00+07:00',
        numberOfCourts: 1,
        customerType: VenueCustomerType.WALK_IN,
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses a higher-priority specific-date rule over an everyday rule', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      ...baseVenue,
      priceBooks: [
        {
          id: 'book-1',
          currency: 'VND',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          rules: [
            {
              id: 'everyday',
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
            {
              id: 'holiday',
              dayType: VenueDayType.SPECIFIC_DATE,
              daysOfWeek: [],
              specificDate: new Date('2026-08-01T00:00:00Z'),
              startMinute: 0,
              endMinute: 1440,
              customerType: VenueCustomerType.WALK_IN,
              pricePerHour: 150000,
              minimumMinutes: null,
              billingStepMinutes: null,
              priority: 10,
            },
          ],
        },
      ],
    });

    const result = await service.calculate('venue-1', {
      startTime: '2026-08-01T18:00:00+07:00',
      endTime: '2026-08-01T19:00:00+07:00',
      numberOfCourts: 1,
      customerType: VenueCustomerType.WALK_IN,
    });

    expect(result.totalAmount).toBe(150000);
    expect(result.breakdown[0].ruleId).toBe('holiday');
  });

  it('rejects a range crossing the venue local calendar day', async () => {
    prisma.venue.findUnique.mockResolvedValue(baseVenue);
    await expect(
      service.calculate('venue-1', {
        startTime: '2026-08-01T23:00:00+07:00',
        endTime: '2026-08-02T01:00:00+07:00',
        numberOfCourts: 1,
        customerType: VenueCustomerType.WALK_IN,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
