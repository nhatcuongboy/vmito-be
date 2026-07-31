import { PointReason, RankingTier } from '@prisma/client';

// Scoring rules (user-approved). Tune here, then re-run backfill if needed.
export const POINT_VALUES: Record<PointReason, number> = {
  SESSION_MATCH_WIN: 10,
  SESSION_MATCH_DRAW: 5,
  SESSION_MATCH_LOSS: 2,
  SESSION_PARTICIPATION: 5,
  TOURNAMENT_MATCH_WIN: 20,
  TOURNAMENT_MATCH_DRAW: 10,
  TOURNAMENT_MATCH_LOSS: 5,
  TOURNAMENT_CHAMPION: 100,
  TOURNAMENT_RUNNER_UP: 60,
  TOURNAMENT_SEMIFINALIST: 30,
  ADJUSTMENT: 0,
};

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

export type LeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

// Vietnam has no DST, so a fixed +7 offset is safe.
const VN_UTC_OFFSET_MS = 7 * 3_600_000;

/** Start of the given period in Vietnam time, returned as a UTC Date. */
export function periodStart(
  period: LeaderboardPeriod,
  now = new Date()
): Date | null {
  if (period === 'all') return null;
  const vn = new Date(now.getTime() + VN_UTC_OFFSET_MS);
  let startVn: Date;
  switch (period) {
    case 'week': {
      const day = vn.getUTCDay(); // 0 = Sunday
      const daysFromMonday = (day + 6) % 7;
      startVn = new Date(
        Date.UTC(
          vn.getUTCFullYear(),
          vn.getUTCMonth(),
          vn.getUTCDate() - daysFromMonday
        )
      );
      break;
    }
    case 'month':
      startVn = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1));
      break;
    case 'year':
      startVn = new Date(Date.UTC(vn.getUTCFullYear(), 0, 1));
      break;
  }
  return new Date(startVn.getTime() - VN_UTC_OFFSET_MS);
}
