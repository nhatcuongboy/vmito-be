import {
  VenueCustomerType,
  VenueRentalProposalKind,
  VenueRentalProposalStatus,
  VenueRentalSelectionMode,
  VenueRentalStatus,
} from '@prisma/client';
import { subtractRanges } from './venue-courts.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';
import { VenueRentalsService } from './venue-rentals.service';

const at = (time: string) => new Date(`2030-01-01T${time}:00.000Z`);

describe('subtractRanges', () => {
  it('holds only what the booking does not already cover', () => {
    expect(
      subtractRanges(at('10:00'), at('13:00'), [
        { startTime: at('09:00'), endTime: at('11:00') },
      ])
    ).toEqual([{ startTime: at('11:00'), endTime: at('13:00') }]);
  });

  it('splits around a booking in the middle', () => {
    expect(
      subtractRanges(at('10:00'), at('14:00'), [
        { startTime: at('11:00'), endTime: at('12:00') },
      ])
    ).toEqual([
      { startTime: at('10:00'), endTime: at('11:00') },
      { startTime: at('12:00'), endTime: at('14:00') },
    ]);
  });

  it('leaves nothing when the booking covers it all', () => {
    expect(
      subtractRanges(at('10:00'), at('11:00'), [
        { startTime: at('09:00'), endTime: at('12:00') },
      ])
    ).toEqual([]);
  });
});

describe('VenueRentalPaymentsService.settleReschedule', () => {
  const makeTx = (paid: number, adjusted = 0) => ({
    venueRentalTransaction: {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({ _sum: { amount: paid } })
        .mockResolvedValueOnce({ _sum: { amount: adjusted } }),
      create: jest.fn().mockResolvedValue({ id: 'refund-1' }),
    },
    venueRentalEvent: { create: jest.fn() },
  });
  const service = new VenueRentalPaymentsService(
    {} as never,
    {} as never,
    {} as never
  );
  const request = {
    id: 'rental-1',
    confirmedCurrency: 'VND',
    depositAmount: 100_000,
    paymentBalanceDueHours: 2,
  };
  const start = new Date(Date.now() + 48 * 3_600_000);

  it('raises what is left to pay when the new slot costs more', async () => {
    const tx = makeTx(100_000);
    const result = await service.settleReschedule(
      tx as never,
      request,
      300_000,
      start,
      'manager-1'
    );
    expect(result.refund).toBeNull();
    expect(result.money.depositAmount).toBe(100_000);
    expect(result.money.balanceAmount).toBe(200_000);
    expect(tx.venueRentalTransaction.create).not.toHaveBeenCalled();
  });

  it('refunds the difference when paid more than the new price', async () => {
    const tx = makeTx(300_000);
    const result = await service.settleReschedule(
      tx as never,
      request,
      200_000,
      start,
      'manager-1'
    );
    expect(result.refund).toEqual({ id: 'refund-1' });
    expect(tx.venueRentalTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 100_000,
        isAdjustment: true,
      }) as unknown,
    });
  });

  it('does not refund the same difference twice', async () => {
    const tx = makeTx(300_000, 100_000);
    const result = await service.settleReschedule(
      tx as never,
      request,
      200_000,
      start,
      'manager-1'
    );
    expect(result.refund).toBeNull();
  });
});

describe('VenueRentalsService.reschedule', () => {
  const tx = {
    venueRentalProposal: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'proposal-1' }),
    },
    venueRentalRequest: { update: jest.fn() },
    venueRentalEvent: { create: jest.fn() },
  };
  const start = new Date(Date.now() + 72 * 3_600_000);
  const source = {
    id: 'rental-1',
    venueId: 'venue-1',
    requesterId: 'player-1',
    status: VenueRentalStatus.CONFIRMED,
    confirmedStartTime: start,
    confirmedCurrency: 'VND',
    depositAmount: 0,
    paymentBalanceDueHours: 2,
    venue: { courtSelectionEnabled: true, timezone: 'Asia/Ho_Chi_Minh' },
    proposals: [] as unknown[],
  };
  const prisma = {
    venueRentalRequest: { findUnique: jest.fn() },
    venueManager: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const access = { assertManager: jest.fn() };
  const notifications = {
    createForUser: jest.fn(),
    createManyForUsers: jest.fn(),
  };
  const courts = {
    holdForReschedule: jest.fn().mockResolvedValue(['court-2']),
    releaseRequestHolds: jest.fn(),
    releaseRequestAllocations: jest.fn(),
    allocateRequest: jest.fn().mockResolvedValue(['court-2']),
  };
  const payments = {
    settleReschedule: jest
      .fn()
      .mockResolvedValue({ refund: null, money: { balanceAmount: 0 } }),
  };
  const pricing = {
    calculate: jest.fn().mockResolvedValue({
      startTime: start,
      endTime: new Date(start.getTime() + 3_600_000),
      currency: 'VND',
      totalAmount: 200_000,
      priceBookId: null,
      version: 1,
      breakdown: [],
    }),
  };
  const service = new VenueRentalsService(
    prisma as never,
    pricing as never,
    access as never,
    notifications as never,
    courts as never,
    payments as never
  );
  const dto = {
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 3_600_000).toISOString(),
    numberOfCourts: 1,
    customerType: VenueCustomerType.WALK_IN,
    selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
    courtIds: ['court-2'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.venueRentalRequest.findUnique.mockResolvedValue(source);
  });

  it('keeps the booking and asks the customer', async () => {
    await service.reschedule('rental-1', dto, 'manager-1', 'USER');

    expect(tx.venueRentalProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: VenueRentalProposalKind.RESCHEDULE,
        requestedCourtIds: ['court-2'],
      }) as unknown,
    });
    expect(courts.releaseRequestAllocations).not.toHaveBeenCalled();
    expect(tx.venueRentalRequest.update).not.toHaveBeenCalled();
    expect(notifications.createForUser).toHaveBeenCalled();
  });

  it('applies straight away when there is nobody to ask', async () => {
    prisma.venueRentalRequest.findUnique.mockResolvedValue({
      ...source,
      requesterId: null,
    });

    await service.reschedule('rental-1', dto, 'manager-1', 'USER');

    expect(tx.venueRentalProposal.create).not.toHaveBeenCalled();
    expect(courts.releaseRequestAllocations).toHaveBeenCalledWith(
      tx,
      'rental-1'
    );
    expect(tx.venueRentalRequest.update).toHaveBeenCalled();
  });

  it('refuses a booking that already started', async () => {
    prisma.venueRentalRequest.findUnique.mockResolvedValue({
      ...source,
      confirmedStartTime: new Date(Date.now() - 1000),
    });

    await expect(
      service.reschedule('rental-1', dto, 'manager-1', 'USER')
    ).rejects.toMatchObject({ response: { code: 'RENTAL_STARTED' } });
  });

  it('takes the holds back when the customer declines', async () => {
    prisma.venueRentalRequest.findUnique.mockResolvedValue({
      ...source,
      proposals: [
        {
          id: 'proposal-1',
          kind: VenueRentalProposalKind.RESCHEDULE,
          status: VenueRentalProposalStatus.PENDING,
        },
      ],
    });
    (tx.venueRentalProposal as Record<string, jest.Mock>).update = jest.fn();

    await service.declineProposal('rental-1', 'proposal-1', 'player-1');

    expect(courts.releaseRequestHolds).toHaveBeenCalledWith(tx, 'rental-1');
    expect(tx.venueRentalRequest.update).not.toHaveBeenCalled();
  });
});
