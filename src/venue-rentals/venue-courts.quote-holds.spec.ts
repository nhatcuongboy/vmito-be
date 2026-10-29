import { VenueRentalAllocationStatus } from '@prisma/client';
import { VenueCourtsService } from './venue-courts.service';

describe('VenueCourtsService.releaseRequesterQuoteHolds', () => {
  const tx = {
    venueRentalQuote: { findMany: jest.fn(), updateMany: jest.fn() },
    venueRentalCourtAllocation: { updateMany: jest.fn() },
  };
  const service = new VenueCourtsService(
    {} as never,
    {} as never,
    {} as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('releases holds of the requester older unused quotes and expires them', async () => {
    tx.venueRentalQuote.findMany.mockResolvedValue([{ id: 'old-1' }]);

    await service.releaseRequesterQuoteHolds(
      tx as never,
      'venue-1',
      'user-1',
      'new-quote'
    );

    expect(tx.venueRentalQuote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: 'venue-1',
          requesterId: 'user-1',
          consumedAt: null,
          id: { not: 'new-quote' },
        }),
      })
    );
    expect(tx.venueRentalCourtAllocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          quoteId: { in: ['old-1'] },
          status: VenueRentalAllocationStatus.HELD,
        },
      })
    );
    expect(tx.venueRentalQuote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['old-1'] } } })
    );
  });

  it('does nothing when the requester has no other live quote', async () => {
    tx.venueRentalQuote.findMany.mockResolvedValue([]);

    await service.releaseRequesterQuoteHolds(
      tx as never,
      'venue-1',
      'user-1',
      'new-quote'
    );

    expect(tx.venueRentalCourtAllocation.updateMany).not.toHaveBeenCalled();
    expect(tx.venueRentalQuote.updateMany).not.toHaveBeenCalled();
  });
});
