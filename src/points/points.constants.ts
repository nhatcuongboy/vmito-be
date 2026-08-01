import { PointReason, RankingTier } from '@prisma/client';

// Scoring rules (user-approved). Tune here, then re-run backfill if needed.
export const POINT_VALUES: Record<PointReason, number> = {
  SESSION_MATCH_WIN: 10,
  SESSION_MATCH_DRAW: 5,
  SESSION_MATCH_LOSS: 2,
  SESSION_PARTICIPATION: 5,
  SESSION_HOSTED: 15,
  TOURNAMENT_MATCH_WIN: 20,
  TOURNAMENT_MATCH_DRAW: 10,
  TOURNAMENT_MATCH_LOSS: 5,
  TOURNAMENT_CHAMPION: 100,
  TOURNAMENT_RUNNER_UP: 60,
  TOURNAMENT_SEMIFINALIST: 30,
  ADJUSTMENT: 0,
};

/**
 * A host only earns points once this many distinct Vmito accounts actually
 * played in the session — guests are excluded so points cannot be farmed.
 */
export const HOST_MIN_ACTIVE_PLAYERS = 4;

/** Leaderboards are split by board so hosting cannot inflate a player's rank. */
export type PointsBoard = 'player' | 'host';

export const HOST_REASONS: PointReason[] = ['SESSION_HOSTED'];

export const PLAYER_REASONS: PointReason[] = (
  Object.keys(POINT_VALUES) as PointReason[]
).filter((reason) => !HOST_REASONS.includes(reason));

export const reasonsForBoard = (board: PointsBoard): PointReason[] =>
  board === 'host' ? HOST_REASONS : PLAYER_REASONS;

// All-time points required to reach each tier (per sport).
export const TIER_THRESHOLDS: { tier: RankingTier; minPoints: number }[] = [
  { tier: 'DIAMOND', minPoints: 10000 },
  { tier: 'PLATINUM', minPoints: 4000 },
  { tier: 'GOLD', minPoints: 1500 },
  { tier: 'SILVER', minPoints: 500 },
  { tier: 'BRONZE', minPoints: 0 },
];

export const TIER_ORDER: RankingTier[] = [
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
];

export function tierForPoints(totalPoints: number): RankingTier {
  for (const { tier, minPoints } of TIER_THRESHOLDS) {
    if (totalPoints >= minPoints) return tier;
  }
  return 'BRONZE';
}

export function nextTierInfo(
  totalPoints: number
): { nextTier: RankingTier; pointsToNext: number } | null {
  const ascending = [...TIER_THRESHOLDS].reverse();
  for (const { tier, minPoints } of ascending) {
    if (totalPoints < minPoints) {
      return { nextTier: tier, pointsToNext: minPoints - totalPoints };
    }
  }
  return null; // Already DIAMOND
}

export type LeaderboardPeriod = 'week' | 'month' | 'season' | 'year' | 'all';

/** A season is a calendar quarter: S1 Jan–Mar, S2 Apr–Jun, S3 Jul–Sep, S4 Oct–Dec. */
export const SEASON_MONTHS = 3;

// Vietnam has no DST, so a fixed +7 offset is safe.
const VN_UTC_OFFSET_MS = 7 * 3_600_000;

const toVn = (utc: Date) => new Date(utc.getTime() + VN_UTC_OFFSET_MS);
const toUtc = (vn: Date) => new Date(vn.getTime() - VN_UTC_OFFSET_MS);
const vnDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day));

const pad = (value: number) => String(value).padStart(2, '0');

export interface PeriodRange {
  /** Inclusive lower bound, null for the all-time period. */
  start: Date | null;
  /** Exclusive upper bound, null for the all-time period. */
  end: Date | null;
  /** Canonical key of the resolved period, null for all-time. */
  key: string | null;
  isCurrent: boolean;
}

/** Monday 00:00 Vietnam time of the week containing `vn`. */
function weekStartVn(vn: Date): Date {
  const daysFromMonday = (vn.getUTCDay() + 6) % 7;
  return vnDate(
    vn.getUTCFullYear(),
    vn.getUTCMonth(),
    vn.getUTCDate() - daysFromMonday
  );
}

function startOfPeriodVn(period: LeaderboardPeriod, vn: Date): Date {
  switch (period) {
    case 'week':
      return weekStartVn(vn);
    case 'month':
      return vnDate(vn.getUTCFullYear(), vn.getUTCMonth(), 1);
    case 'season':
      return vnDate(
        vn.getUTCFullYear(),
        Math.floor(vn.getUTCMonth() / SEASON_MONTHS) * SEASON_MONTHS,
        1
      );
    default:
      return vnDate(vn.getUTCFullYear(), 0, 1);
  }
}

function endOfPeriodVn(period: LeaderboardPeriod, startVn: Date): Date {
  const y = startVn.getUTCFullYear();
  const m = startVn.getUTCMonth();
  switch (period) {
    case 'week':
      return vnDate(y, m, startVn.getUTCDate() + 7);
    case 'month':
      return vnDate(y, m + 1, 1);
    case 'season':
      return vnDate(y, m + SEASON_MONTHS, 1);
    default:
      return vnDate(y + 1, 0, 1);
  }
}

export function periodKeyFor(period: LeaderboardPeriod, startVn: Date): string {
  const y = startVn.getUTCFullYear();
  switch (period) {
    case 'week':
      return `${y}-${pad(startVn.getUTCMonth() + 1)}-${pad(startVn.getUTCDate())}`;
    case 'month':
      return `${y}-${pad(startVn.getUTCMonth() + 1)}`;
    case 'season':
      return `${y}-S${Math.floor(startVn.getUTCMonth() / SEASON_MONTHS) + 1}`;
    default:
      return `${y}`;
  }
}

/**
 * Parses a client-supplied period key into its Vietnam-time start.
 * Returns null when the key does not match the period's format.
 */
function parsePeriodKey(period: LeaderboardPeriod, key: string): Date | null {
  const matched = (re: RegExp) => re.exec(key);
  switch (period) {
    case 'week': {
      const m = matched(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const start = vnDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      // Only accept the canonical Monday so every key maps to exactly one range.
      return weekStartVn(start).getTime() === start.getTime() ? start : null;
    }
    case 'month': {
      const m = matched(/^(\d{4})-(\d{2})$/);
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
      return vnDate(Number(m[1]), Number(m[2]) - 1, 1);
    }
    case 'season': {
      const m = matched(/^(\d{4})-S([1-4])$/);
      if (!m) return null;
      return vnDate(Number(m[1]), (Number(m[2]) - 1) * SEASON_MONTHS, 1);
    }
    default: {
      const m = matched(/^(\d{4})$/);
      return m ? vnDate(Number(m[1]), 0, 1) : null;
    }
  }
}

/**
 * Resolves the UTC range for a period. An unknown, malformed or future
 * `periodKey` falls back to the current period.
 */
export function resolvePeriodRange(
  period: LeaderboardPeriod,
  periodKey?: string,
  now = new Date()
): PeriodRange {
  if (period === 'all') {
    return { start: null, end: null, key: null, isCurrent: true };
  }

  const vnNow = toVn(now);
  const currentStartVn = startOfPeriodVn(period, vnNow);
  const requestedStartVn = periodKey ? parsePeriodKey(period, periodKey) : null;
  const startVn =
    requestedStartVn && requestedStartVn.getTime() <= currentStartVn.getTime()
      ? requestedStartVn
      : currentStartVn;

  return {
    start: toUtc(startVn),
    end: toUtc(endOfPeriodVn(period, startVn)),
    key: periodKeyFor(period, startVn),
    isCurrent: startVn.getTime() === currentStartVn.getTime(),
  };
}

/** Start of the given period in Vietnam time, returned as a UTC Date. */
export function periodStart(
  period: LeaderboardPeriod,
  now = new Date()
): Date | null {
  return resolvePeriodRange(period, undefined, now).start;
}
