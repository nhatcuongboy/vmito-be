import { VenueRentalStatus } from '@prisma/client';
import { VenueRentalsService } from './venue-rentals.service';

describe('VenueRentalsService.processLifecycle — stale requests', () => {
  const tx = {
    venueRentalRequest: { updateMany: jest.fn() },
    venueRentalEvent: { create: jest.fn() },
  };
  const prisma = {
    venueRentalProposal: { findMany: jest.fn() },
    venueRentalRequest: { findMany: jest.fn() },
    venueManager: { findMany: jest.fn() },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const notifications = {
    createForUser: jest.fn(),
    createManyForUsers: jest.fn(),
  };
  const courts = {
    releaseExpiredHolds: jest.fn(),
    releaseRequestAllocations: jest.fn(),
  };
  const service = new VenueRentalsService(
    prisma as never,
    {} as never,
    {} as never,
    notifications as never,
    courts as never,
    {} as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.venueRentalProposal.findMany.mockResolvedValue([]);
    prisma.venueManager.findMany.mockResolvedValue([{ userId: 'manager-1' }]);
    courts.releaseExpiredHolds.mockResolvedValue({ count: 0 });
    tx.venueRentalRequest.updateMany.mockResolvedValue({ count: 1 });
  });

  const staleThenNothing = () =>
    prisma.venueRentalRequest.findMany
      .mockResolvedValueOnce([
        { id: 'request-1', venueId: 'venue-1', requesterId: 'user-1' },
      ])
      .mockResolvedValue([]);

  it('cancels an unanswered request and tells both sides', async () => {
    staleThenNothing();

    const result = await service.processLifecycle();

    expect(result.lapsed).toBe(1);
    expect(tx.venueRentalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1', status: VenueRentalStatus.PENDING },
      })
    );
    expect(courts.releaseRequestAllocations).toHaveBeenCalledWith(
      tx,
      'request-1'
    );
    expect(notifications.createForUser).toHaveBeenCalledTimes(1);
    expect(notifications.createManyForUsers).toHaveBeenCalledTimes(1);
  });

  it('stays silent when another worker got there first', async () => {
    staleThenNothing();
    tx.venueRentalRequest.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.processLifecycle();

    expect(result.lapsed).toBe(0);
    expect(notifications.createForUser).not.toHaveBeenCalled();
  });

  it('reminds the player before a confirmed booking', async () => {
    prisma.venueRentalRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-2',
          requesterId: 'user-2',
          confirmedStartTime: new Date('2026-08-01T11:00:00Z'),
          venue: { name: 'Sân A', timezone: 'Asia/Ho_Chi_Minh' },
        },
      ])
      .mockResolvedValue([]);

    const result = await service.processLifecycle();

    expect(result.reminded).toBe(1);
    const [, , , , data] = notifications.createForUser.mock.calls[0] as [
      string,
      string,
      string,
      string,
      Record<string, string>,
    ];
    expect(data).toMatchObject({
      action: 'rental_starts_soon',
      venueName: 'Sân A',
      startTime: '18:00',
    });
  });
});
