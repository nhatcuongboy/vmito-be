import { RANKED } from './ranked.constants';

/**
 * Pure anti-farming math for the verified ranking. Kept free of Prisma so the
 * rules are unit-tested directly.
 */

/** Multiplier for the n-th (0-based) recent match against one opponent. */
export function repeatMultiplier(priorMatchesVsOpponent: number): number {
  const steps = RANKED.repeatOpponentMultipliers;
  return steps[Math.min(priorMatchesVsOpponent, steps.length - 1)];
}

/**
 * Average weight over every opponent in the match (one in singles, two in
 * doubles): real accounts decay with repeat meetings, guests use a fixed
 * weight because they cannot be tracked across sessions.
 */
export function matchMultiplier(
  opponentUserIds: string[],
  guestOpponents: number,
  priorCountByOpponent: Map<string, number>
): number {
  const count = opponentUserIds.length + guestOpponents;
  if (count === 0) return 0;
  const sum =
    opponentUserIds.reduce(
      (acc, id) => acc + repeatMultiplier(priorCountByOpponent.get(id) ?? 0),
      0
    ) +
    guestOpponents * RANKED.guestOpponentMultiplier;
  return sum / count;
}

/** Counts how many recent matches the player had against each opponent. */
export function countPriorOpponents(
  recentOpponentLists: string[][]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const list of recentOpponentLists) {
    for (const id of new Set(list)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Applies the multiplier and the daily cap; never negative. */
export function cappedPoints(
  basePoints: number,
  multiplier: number,
  earnedTodayBefore: number
): number {
  const raw = Math.round(basePoints * multiplier);
  const room = Math.max(0, RANKED.dailyCapPoints - earnedTodayBefore);
  return Math.max(0, Math.min(raw, room));
}

// Vietnam has no DST, so a fixed +7 offset is safe (same as points.constants).
const VN_OFFSET_MS = 7 * 3_600_000;

/** UTC instants bounding the Vietnam calendar day containing `at`. */
export function vnDayRange(at: Date): { start: Date; end: Date } {
  const vn = new Date(at.getTime() + VN_OFFSET_MS);
  const startVn = Date.UTC(
    vn.getUTCFullYear(),
    vn.getUTCMonth(),
    vn.getUTCDate()
  );
  const start = new Date(startVn - VN_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
