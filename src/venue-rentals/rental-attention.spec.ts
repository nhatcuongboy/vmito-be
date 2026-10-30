import {
  VenueRentalStatus,
  VenueRentalTransactionDirection,
  VenueRentalTransactionPurpose,
  VenueRentalTransactionStatus,
} from '@prisma/client';
import { rentalAttentionReasons } from './rental-attention';

describe('rentalAttentionReasons', () => {
  const now = new Date('2026-08-01T10:00:00Z');
  const base = {
    status: VenueRentalStatus.CONFIRMED,
    depositAmount: 100000,
    depositDueAt: null,
    balanceAmount: 300000,
    balanceDueAt: new Date('2026-08-01T12:00:00Z'),
    transactions: [],
  };

  it('flags a pending request for approval', () => {
    expect(
      rentalAttentionReasons(
        { ...base, status: VenueRentalStatus.PENDING },
        now
      )
    ).toEqual(['PENDING_APPROVAL']);
  });

  it('flags submitted proofs and pending refunds', () => {
    expect(
      rentalAttentionReasons(
        {
          ...base,
          transactions: [
            {
              purpose: VenueRentalTransactionPurpose.BALANCE,
              direction: VenueRentalTransactionDirection.IN,
              status: VenueRentalTransactionStatus.SUBMITTED,
              amount: 300000,
            },
            {
              purpose: VenueRentalTransactionPurpose.REFUND,
              direction: VenueRentalTransactionDirection.OUT,
              status: VenueRentalTransactionStatus.PENDING,
              amount: 50000,
            },
          ],
        },
        now
      )
    ).toEqual(['PAYMENT_REVIEW', 'REFUND_PENDING']);
  });

  it('flags a deposit due within two hours only while unpaid', () => {
    const awaiting = {
      ...base,
      status: VenueRentalStatus.AWAITING_DEPOSIT,
      depositDueAt: new Date('2026-08-01T11:00:00Z'),
    };
    expect(rentalAttentionReasons(awaiting, now)).toEqual(['DEPOSIT_DUE_SOON']);
    expect(
      rentalAttentionReasons(
        {
          ...awaiting,
          transactions: [
            {
              purpose: VenueRentalTransactionPurpose.DEPOSIT,
              direction: VenueRentalTransactionDirection.IN,
              status: VenueRentalTransactionStatus.APPROVED,
              amount: 100000,
            },
          ],
        },
        now
      )
    ).toEqual([]);
  });

  it('flags an unpaid balance past its due time', () => {
    expect(
      rentalAttentionReasons(
        { ...base, balanceDueAt: new Date('2026-08-01T09:00:00Z') },
        now
      )
    ).toEqual(['BALANCE_OVERDUE']);
    expect(rentalAttentionReasons(base, now)).toEqual([]);
  });
});
