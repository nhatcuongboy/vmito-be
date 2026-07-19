import { ConflictException } from '@nestjs/common';
import { VenueRentalStatus } from '@prisma/client';
import { VenueRentalsService } from './venue-rentals.service';

describe('VenueRentalsService capacity calculation', () => {
  const service = new VenueRentalsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  type RentalCapacity = {
    confirmedStartTime: Date | null;
    confirmedEndTime: Date | null;
    confirmedNumberOfCourts: number | null;
  };
  type CapacityCalculator = (
    rentals: RentalCapacity[],
    start: Date,
    end: Date,
    requested?: number
  ) => number;
  const calculator: CapacityCalculator = (rentals, start, end, requested) =>
    (
      service as unknown as { maxConcurrentCourts: CapacityCalculator }
    ).maxConcurrentCourts(rentals, start, end, requested);

  it('finds the peak across partially overlapping rentals', () => {
    const start = new Date('2026-08-01T10:00:00Z');
    const end = new Date('2026-08-01T13:00:00Z');
    const peak = calculator(
      [
        {
          confirmedStartTime: new Date('2026-08-01T10:00:00Z'),
          confirmedEndTime: new Date('2026-08-01T12:00:00Z'),
          confirmedNumberOfCourts: 2,
        },
        {
          confirmedStartTime: new Date('2026-08-01T11:00:00Z'),
          confirmedEndTime: new Date('2026-08-01T13:00:00Z'),
          confirmedNumberOfCourts: 1,
        },
      ],
      start,
      end,
      1
    );
    expect(peak).toBe(4);
  });

  it('does not overlap adjacent rentals', () => {
    const peak = calculator(
      [
        {
          confirmedStartTime: new Date('2026-08-01T10:00:00Z'),
          confirmedEndTime: new Date('2026-08-01T11:00:00Z'),
          confirmedNumberOfCourts: 3,
        },
      ],
      new Date('2026-08-01T11:00:00Z'),
      new Date('2026-08-01T12:00:00Z'),
      2
    );
    expect(peak).toBe(2);
  });

  it('finds the peak when one rental fully contains another', () => {
    const peak = calculator(
      [
        {
          confirmedStartTime: new Date('2026-08-01T09:00:00Z'),
          confirmedEndTime: new Date('2026-08-01T14:00:00Z'),
          confirmedNumberOfCourts: 2,
        },
        {
          confirmedStartTime: new Date('2026-08-01T11:00:00Z'),
          confirmedEndTime: new Date('2026-08-01T12:00:00Z'),
          confirmedNumberOfCourts: 2,
        },
      ],
      new Date('2026-08-01T10:00:00Z'),
      new Date('2026-08-01T13:00:00Z'),
      1
    );
    expect(peak).toBe(5);
  });
});

describe('VenueRentalsService workflow', () => {
  const prisma = {
    $transaction: jest.fn(),
    venueRentalProposal: { findMany: jest.fn() },
    venueRentalRequest: { findMany: jest.fn() },
  };
  const access = { assertManager: jest.fn() };
  const notifications = { createForUser: jest.fn() };
  const courts = { releaseExpiredHolds: jest.fn() };
  const service = new VenueRentalsService(
    prisma as never,
    {} as never,
    access as never,
    notifications as never,
    courts as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects approval outside the pending state', async () => {
    jest.spyOn(service as never, 'getRequest').mockResolvedValueOnce({
      venueId: 'venue-1',
      status: VenueRentalStatus.CONFIRMED,
    } as never);
    access.assertManager.mockResolvedValue(undefined);

    await expect(
      service.approve('request-1', 'manager-1', 'PLAYER')
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not notify twice when another worker expired the proposal first', async () => {
    prisma.venueRentalProposal.findMany.mockResolvedValue([
      {
        id: 'proposal-1',
        request: {
          id: 'request-1',
          requesterId: 'requester-1',
          status: VenueRentalStatus.COUNTER_OFFERED,
        },
      },
    ]);
    prisma.venueRentalRequest.findMany.mockResolvedValue([]);
    prisma.$transaction.mockResolvedValue(false);
    courts.releaseExpiredHolds.mockResolvedValue({ count: 0 });

    await expect(service.processLifecycle()).resolves.toEqual({
      expired: 1,
      completed: 0,
      releasedHolds: 0,
    });
    expect(notifications.createForUser).not.toHaveBeenCalled();
  });
});
