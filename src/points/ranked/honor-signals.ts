import { DAY_MS, RANKED } from './ranked.constants';

/**
 * Pure fraud signals shown next to each top player in the honor review.
 * They never change points by themselves; an admin reads them and decides.
 */

export interface SignalRow {
  reason: string;
  points: number;
  opponentUserIds: string[];
  guestOpponents: number;
  sessionHostId: string | null;
  matchMinutes: number;
  occurredAt: Date;
}

export interface SignalContext {
  /** Account creation time of every opponent seen in `rows`. */
  opponentCreatedAt: Map<string, Date>;
  /** Opponents sharing a registered device with the player. */
  sharedDeviceOpponents: number;
  /** Matches of the player in the period that ended DISPUTED or REJECTED. */
  disputedOrRejected: number;
  /** NOT_PARTICIPATED disputes by others on matches of this player. */
  notParticipatedReports: number;
}

export interface HonorSignals {
  matches: number;
  wins: number;
  distinctOpponents: number;
  distinctHosts: number;
  topOpponentsPointShare: number;
  topHostPointShare: number;
  guestOpponentPointShare: number;
  newAccountOpponents: number;
  sharedDeviceOpponents: number;
  medianMatchMinutes: number;
  disputedOrRejected: number;
  notParticipatedReports: number;
}

export const FLAG_THRESHOLDS = {
  topOpponentsPointShare: 0.6,
  /** Most points from one organiser's sessions: a host may be feeding them. */
  topHostPointShare: 0.7,
  guestOpponentPointShare: 0.5,
  newAccountOpponents: 3,
  medianMatchMinutes: 12,
  disputedOrRejected: 3,
} as const;

export function computeSignals(
  rows: SignalRow[],
  ctx: SignalContext
): HonorSignals {
  const totalPoints = sum(rows.map((r) => r.points));

  const opponentMatches = countBy(rows.flatMap((r) => r.opponentUserIds));
  const top3 = new Set(topKeys(opponentMatches, 3));
  const topOpponentPoints = sum(
    rows
      .filter((r) => r.opponentUserIds.some((id) => top3.has(id)))
      .map((r) => r.points)
  );

  const hostPoints = new Map<string, number>();
  for (const row of rows) {
    if (!row.sessionHostId) continue;
    hostPoints.set(
      row.sessionHostId,
      (hostPoints.get(row.sessionHostId) ?? 0) + row.points
    );
  }
  const topHostPoints = Math.max(0, ...hostPoints.values());

  const newAccounts = new Set<string>();
  for (const row of rows) {
    for (const id of row.opponentUserIds) {
      const createdAt = ctx.opponentCreatedAt.get(id);
      if (
        createdAt &&
        row.occurredAt.getTime() - createdAt.getTime() <
          RANKED.newAccountDays * DAY_MS
      ) {
        newAccounts.add(id);
      }
    }
  }

  return {
    matches: rows.length,
    wins: rows.filter((r) => r.reason === 'SESSION_MATCH_WIN').length,
    distinctOpponents: opponentMatches.size,
    distinctHosts: hostPoints.size,
    topOpponentsPointShare: ratio(topOpponentPoints, totalPoints),
    topHostPointShare: ratio(topHostPoints, totalPoints),
    guestOpponentPointShare: ratio(
      sum(rows.filter((r) => r.guestOpponents > 0).map((r) => r.points)),
      totalPoints
    ),
    newAccountOpponents: newAccounts.size,
    sharedDeviceOpponents: ctx.sharedDeviceOpponents,
    medianMatchMinutes: median(rows.map((r) => r.matchMinutes)),
    disputedOrRejected: ctx.disputedOrRejected,
    notParticipatedReports: ctx.notParticipatedReports,
  };
}

export function flagsFor(s: HonorSignals): string[] {
  const t = FLAG_THRESHOLDS;
  const flags: string[] = [];
  if (s.topOpponentsPointShare >= t.topOpponentsPointShare)
    flags.push('CONCENTRATED_OPPONENTS');
  if (s.topHostPointShare >= t.topHostPointShare) flags.push('SINGLE_HOST');
  if (s.guestOpponentPointShare >= t.guestOpponentPointShare)
    flags.push('GUEST_OPPONENTS');
  if (s.newAccountOpponents >= t.newAccountOpponents)
    flags.push('NEW_ACCOUNT_OPPONENTS');
  if (s.sharedDeviceOpponents > 0) flags.push('SHARED_DEVICE');
  if (s.matches > 0 && s.medianMatchMinutes < t.medianMatchMinutes)
    flags.push('SHORT_MATCHES');
  if (s.disputedOrRejected >= t.disputedOrRejected) flags.push('DISPUTES');
  if (s.notParticipatedReports > 0) flags.push('NOT_PARTICIPATED_REPORTS');
  return flags;
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

function topKeys(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) / 100 : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
