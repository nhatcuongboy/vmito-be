import {
  VenueRentalDepositMode,
  VenueRentalPaymentMethod,
  VenueRentalStatus,
  VenueRentalTransactionDirection,
  VenueRentalTransactionPurpose,
  VenueRentalTransactionStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import {
  calculateRentalDeposit,
  calculateRentalRefund,
  VenueRentalPaymentsService,
} from './venue-rental-payments.service';

describe('venue rental payment calculations', () => {
  it('rounds percentage deposits up to one VND', () => {
    expect(
      calculateRentalDeposit(101, VenueRentalDepositMode.PERCENTAGE, 10)
    ).toBe(11);
  });

  it('caps fixed deposits at the booking total', () => {
    expect(
      calculateRentalDeposit(100_000, VenueRentalDepositMode.FIXED, 150_000)
    ).toBe(100_000);
  });

  it('does not require a deposit in NONE mode', () => {
    expect(
      calculateRentalDeposit(100_000, VenueRentalDepositMode.NONE, 50)
    ).toBe(0);
  });

  it('refunds venue cancellations in full', () => {
    expect(
      calculateRentalRefund(
        80_000,
        false,
        new Date('2026-08-10T10:00:00Z'),
        new Date('2026-08-10T09:00:00Z'),
        24,
        50,
        0
      )
    ).toBe(80_000);
  });

  it('uses the snapshotted before and after cutoff percentages', () => {
    const start = new Date('2026-08-10T10:00:00Z');
    expect(
      calculateRentalRefund(
        100_000,
        true,
        start,
        new Date('2026-08-09T09:59:59Z'),
        24,
        75,
        10
      )
    ).toBe(75_000);
    expect(
      calculateRentalRefund(
        100_000,
        true,
        start,
        new Date('2026-08-09T10:00:00Z'),
        24,
        75,
        10
      )
    ).toBe(10_000);
  });
});

describe('VenueRentalPaymentsService snapshot', () => {
  it('copies policy and recipient details and makes an immediate overdue balance due now', async () => {
    const settings = {
      bankName: 'VCB',
      bankAccountNumber: '123',
      bankAccountName: 'VENUE',
      qrUrl: 'https://example.com/qr.png',
      qrPublicId: 'qr-1',
      depositMode: VenueRentalDepositMode.PERCENTAGE,
      depositValue: 25,
      depositDeadlineMinutes: 30,
      balanceDueHours: 2,
      refundCutoffHours: 24,
      refundBeforePercent: 80,
      refundAfterPercent: 20,
    };
    const tx = {
      venueRentalPaymentSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
    };
    const service = new VenueRentalPaymentsService(
      {} as never,
      {} as never,
      {} as never
    );
    const acceptedAt = new Date('2026-08-10T09:00:00Z');
    const snapshot = await service.buildSnapshot(
      tx as never,
      'venue-1',
      100_003,
      new Date('2026-08-10T10:00:00Z'),
      acceptedAt
    );

    expect(snapshot).toMatchObject({
      paymentDepositMode: VenueRentalDepositMode.PERCENTAGE,
      paymentDepositValue: 25,
      paymentBankAccountNumber: '123',
      paymentRefundBeforePercent: 80,
      depositAmount: 25_001,
      balanceAmount: 75_002,
      balanceDueAt: acceptedAt,
    });
    expect(snapshot.depositDueAt).toEqual(new Date('2026-08-10T09:30:00Z'));
  });
});

describe('VenueRentalPaymentsService transaction safety', () => {
  it('lets only one concurrent manager approval process the same payment', async () => {
    const request = {
      id: 'rental-1',
      venueId: 'venue-1',
      requesterId: 'renter-1',
      status: VenueRentalStatus.CONFIRMED,
      depositAmount: 0,
      balanceAmount: 100_000,
      depositDueAt: null,
    };
    const submittedPayment = {
      id: 'payment-1',
      requestId: request.id,
      purpose: VenueRentalTransactionPurpose.BALANCE,
      direction: VenueRentalTransactionDirection.IN,
      method: VenueRentalPaymentMethod.BANK_TRANSFER,
      status: VenueRentalTransactionStatus.SUBMITTED,
      amount: 100_000,
      currency: 'VND',
    };
    let processed = false;
    const tx = {
      $queryRawUnsafe: jest.fn(),
      venueRentalRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
      },
      venueRentalTransaction: {
        findFirst: jest.fn().mockResolvedValue(submittedPayment),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        updateMany: jest.fn().mockImplementation(() => {
          if (processed) return { count: 0 };
          processed = true;
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...submittedPayment,
          status: VenueRentalTransactionStatus.APPROVED,
        }),
      },
      venueRentalEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      venueRentalRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx)
      ),
    };
    const access = { assertManager: jest.fn().mockResolvedValue(undefined) };
    const notifications = { createForUser: jest.fn().mockResolvedValue({}) };
    const service = new VenueRentalPaymentsService(
      prisma as never,
      access as never,
      notifications as never
    );

    const results = await Promise.allSettled([
      service.approvePayment(
        request.id,
        submittedPayment.id,
        'manager-1',
        'PLAYER'
      ),
      service.approvePayment(
        request.id,
        submittedPayment.id,
        'manager-2',
        'PLAYER'
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    expect((rejected?.reason as ConflictException).getResponse()).toMatchObject(
      {
        code: 'PAYMENT_ALREADY_PROCESSED',
      }
    );
  });

  it('expires an awaiting deposit and releases its Court only once', async () => {
    const expired = {
      id: 'rental-expired',
      venueId: 'venue-1',
      requesterId: 'renter-1',
      status: VenueRentalStatus.AWAITING_DEPOSIT,
      confirmedStartTime: new Date('2026-08-10T10:00:00Z'),
      confirmedCurrency: 'VND',
      paymentRefundCutoffHours: 24,
      paymentRefundBeforePercent: 100,
      paymentRefundAfterPercent: 100,
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([expired])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expired])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const tx = {
      venueRentalRequest: {
        findUnique: jest.fn().mockResolvedValue(expired),
        updateMany,
      },
      venueRentalCourtAllocation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      venueRentalTransaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      venueRentalEvent: { create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn(),
    };
    const prisma = {
      venueRentalRequest: { findMany, updateMany },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx)
      ),
    };
    const notifications = { createForUser: jest.fn().mockResolvedValue({}) };
    const service = new VenueRentalPaymentsService(
      prisma as never,
      {} as never,
      notifications as never
    );

    await service.processLifecycle();
    await service.processLifecycle();

    expect(tx.venueRentalCourtAllocation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.venueRentalEvent.create).toHaveBeenCalledTimes(1);
    expect(notifications.createForUser).toHaveBeenCalledTimes(1);
  });

  it('marks an unpaid balance overdue without cancelling the booking', async () => {
    const overdue = {
      id: 'rental-overdue',
      venueId: 'venue-1',
      requesterId: 'renter-1',
      status: VenueRentalStatus.CONFIRMED,
      balanceAmount: 100_000,
      transactions: [{ amount: 20_000 }],
    };
    const prisma = {
      venueRentalRequest: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([overdue]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      venueManager: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new VenueRentalPaymentsService(
      prisma as never,
      {} as never,
      { createForUser: jest.fn().mockResolvedValue({}) } as never
    );

    const result = await service.processLifecycle();

    expect(result.balancesOverdue).toBe(1);
    expect(prisma.venueRentalRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(overdue.status).toBe(VenueRentalStatus.CONFIRMED);
  });
});
