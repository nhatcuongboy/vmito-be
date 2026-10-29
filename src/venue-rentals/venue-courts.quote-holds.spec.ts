import { VenueRentalAllocationStatus } from '@prisma/client';
import { VenueCourtsService } from './venue-courts.service';

describe('VenueCourtsService.releaseRequesterQuoteHolds', () => {
  const tx = {
    venueRentalQuote: { findMany: jest.fn(), updateMany: jest.fn() },
    venueRentalCourtAllocation: { updateMany: jest.fn() },
  };
  const service = new VenueCourtsService({} as never, {} as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('releases holds of the requester older unused quotes and expires them', async () => {
    tx.venueRentalQuote.findMany.mockResolvedValue([{ id: 'old-1' }]);

    await service.releaseRequesterQuoteHolds(
      tx as never,
      'venue-1',
      'user-1',
      'new-quote'
    );

    const [query] = tx.venueRentalQuote.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(query.where).toMatchObject({
      venueId: 'venue-1',
      requesterId: 'user-1',
      consumedAt: null,
      id: { not: 'new-quote' },
    });
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

  it('hands a quote hold to the submitted request until the review deadline', async () => {
    const until = new Date('2026-08-01T10:00:00Z');
    await service.holdForRequest(tx as never, 'quote-1', 'request-1', until);

    expect(tx.venueRentalCourtAllocation.updateMany).toHaveBeenCalledWith({
      where: { quoteId: 'quote-1', status: VenueRentalAllocationStatus.HELD },
      data: { requestId: 'request-1', expiresAt: until },
    });
  });

  it('releases a pending-review hold along with reserved and confirmed rows', async () => {
    await service.releaseRequestAllocations(tx as never, 'request-1');

    expect(tx.venueRentalCourtAllocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          requestId: 'request-1',
          status: {
            in: [
              VenueRentalAllocationStatus.HELD,
              VenueRentalAllocationStatus.RESERVED,
              VenueRentalAllocationStatus.CONFIRMED,
            ],
          },
        },
      })
    );
  });
});
