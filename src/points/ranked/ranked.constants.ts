import { PointReason } from '@prisma/client';

/**
 * Verified (honor) ranking rules. Only casual-session matches count for now;
 * tournaments keep earning activity points but stay off this board.
 *
 * Results count as soon as they are recorded. Instead of asking the other
 * side to confirm, players can dispute and admins review (per match, and the
 * top N before an honor list is published).
 */
export const RANKED = {
  /** Shorter matches are treated as ghost matches. */
  minMatchMinutes: 8,
  /** Editing a result later than this after the match makes it ineligible. */
  lateEditDays: 7,

  /** Repeat-opponent decay: the n-th match vs the same account in the window. */
  repeatOpponentWindowDays: 7,
  repeatOpponentMultipliers: [1, 0.5, 0] as readonly number[],
  /**
   * Weight of a guest opponent (no account, so no repeat tracking). Guests
   * never earn points themselves.
   */
  guestOpponentMultiplier: 1,
  /** Ranked points one account can earn from casual matches per VN day. */
  dailyCapPoints: 50,

  /** Minimum activity in a period to appear on the ranked board. */
  minVerifiedMatches: 10,
  /** Distinct real-account opponents; guests do not count. */
  minDistinctOpponents: 5,

  /** Honor review: how many top players an admin vets per period. */
  honorTopN: 20,
  /** Opponent accounts younger than this at match time are a fraud signal. */
  newAccountDays: 7,
} as const;

export const RANKED_REF_MATCH = 'MATCH';

/** Feature flag that shows the honor ranking to players (see PlayerHonorFlagService). */
export const PLAYER_HONOR_FLAG = 'PLAYER_HONOR_ENABLED';

/** Ranked base points (wins only; a loss row records the match with 0). */
export const RANKED_BASE_POINTS: Partial<Record<PointReason, number>> = {
  SESSION_MATCH_WIN: 10,
  SESSION_MATCH_LOSS: 0,
};

export const HONOR_PERIODS = ['month', 'season', 'year'] as const;
export type HonorPeriod = (typeof HONOR_PERIODS)[number];

export const DISPUTE_REASONS = [
  'WRONG_RESULT',
  'NOT_PARTICIPATED',
  'OTHER',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DAY_MS = 24 * 3_600_000;
