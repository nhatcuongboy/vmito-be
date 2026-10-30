import {
  VenueRentalStatus,
  VenueRentalTransactionDirection,
  VenueRentalTransactionPurpose,
  VenueRentalTransactionStatus,
} from '@prisma/client';

/** What a venue manager has to do about a rental, most urgent first. */
export type RentalAttentionReason =
  | 'PENDING_APPROVAL'
  | 'PAYMENT_REVIEW'
  | 'REFUND_PENDING'
  | 'DEPOSIT_DUE_SOON'
  | 'BALANCE_OVERDUE';

/** A deposit due within this window is flagged before it lapses. */
export const DEPOSIT_DUE_SOON_MS = 2 * 60 * 60 * 1000;

export interface AttentionCandidate {
  status: VenueRentalStatus;
  depositAmount: number | null;
  depositDueAt: Date | null;
  balanceAmount: number | null;
  balanceDueAt: Date | null;
  transactions: Array<{
    purpose: VenueRentalTransactionPurpose;
    direction: VenueRentalTransactionDirection;
    status: VenueRentalTransactionStatus;
    amount: number;
  }>;
}

const approvedIn = (
  rental: AttentionCandidate,
  purpose: VenueRentalTransactionPurpose
) =>
  rental.transactions
    .filter(
      (tx) =>
        tx.purpose === purpose &&
        tx.direction === VenueRentalTransactionDirection.IN &&
        tx.status === VenueRentalTransactionStatus.APPROVED
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

/**
 * Same rules as web `RentalPaymentAttention`, computed server-side so the
 * app needs one call instead of a payment summary per rental.
 */
export function rentalAttentionReasons(
  rental: AttentionCandidate,
  now: Date = new Date()
): RentalAttentionReason[] {
  const reasons: RentalAttentionReason[] = [];
  if (rental.status === VenueRentalStatus.PENDING) {
    reasons.push('PENDING_APPROVAL');
  }
  if (
    rental.transactions.some(
      (tx) => tx.status === VenueRentalTransactionStatus.SUBMITTED
    )
  ) {
    reasons.push('PAYMENT_REVIEW');
  }
  if (
    rental.transactions.some(
      (tx) =>
        tx.purpose === VenueRentalTransactionPurpose.REFUND &&
        tx.status === VenueRentalTransactionStatus.PENDING
    )
  ) {
    reasons.push('REFUND_PENDING');
  }
  if (
    rental.status === VenueRentalStatus.AWAITING_DEPOSIT &&
    rental.depositDueAt &&
    rental.depositDueAt.getTime() > now.getTime() &&
    rental.depositDueAt.getTime() - now.getTime() <= DEPOSIT_DUE_SOON_MS &&
    approvedIn(rental, VenueRentalTransactionPurpose.DEPOSIT) <
      (rental.depositAmount ?? 0)
  ) {
    reasons.push('DEPOSIT_DUE_SOON');
  }
  if (
    rental.status === VenueRentalStatus.CONFIRMED &&
    (rental.balanceAmount ?? 0) > 0 &&
    rental.balanceDueAt &&
    rental.balanceDueAt.getTime() < now.getTime() &&
    approvedIn(rental, VenueRentalTransactionPurpose.BALANCE) <
      (rental.balanceAmount ?? 0)
  ) {
    reasons.push('BALANCE_OVERDUE');
  }
  return reasons;
}
