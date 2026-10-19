import {
  DAY_MS,
  ELIGIBILITY,
  PLAYER_WEIGHTS,
  RATING,
} from './host-awards.constants';
import {
  isRealMatch,
  minutesBetween,
  SessionVerdict,
} from './host-qualification';
import {
  AwardRating,
  AwardSession,
  HostMetrics,
  MonthDataset,
  ParticipationRow,
} from './host-awards.types';

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Bayesian average: few ratings are pulled toward the platform mean. */
export function bayesianRating(
  sum: number,
  count: number,
  priorMean: number,
  priorWeight: number = RATING.priorWeight
): number {
  return (sum + priorWeight * priorMean) / (count + priorWeight);
}

/**
 * Player → host ratings that may count: from a verified player of a counted
 * session, sent within the rating window after that session ended.
 */
export function eligibleHostRatings(
  ratings: AwardRating[],
  hostId: string,
  counted: SessionVerdict[]
): AwardRating[] {
  const bySession = new Map(counted.map((v) => [v.sessionId, v]));
  return ratings.filter((rating) => {
    if (rating.type !== 'PLAYER_TO_HOST' || rating.ratedUserId !== hostId) {
      return false;
    }
    const verdict = bySession.get(rating.sessionId);
    if (!verdict || !verdict.verifiedUserIds.includes(rating.raterUserId)) {
      return false;
    }
    const deadline = verdict.endTime.getTime() + RATING.windowDays * DAY_MS;
    return rating.createdAt.getTime() <= deadline;
  });
}

/**
 * New players this host brought to the platform who stayed: their first ever
 * session was one of the host's counted sessions, and they registered
 * themselves for at least one more session afterwards (any host).
 */
export function computeGrowth(
  counted: SessionVerdict[],
  participationByUser: Map<string, ParticipationRow[]>,
  asOf: Date
): number {
  const countedIds = new Set(counted.map((v) => v.sessionId));
  const candidates = new Set(counted.flatMap((v) => v.verifiedUserIds));
  let growth = 0;

  for (const userId of candidates) {
    const rows = (participationByUser.get(userId) ?? [])
      .filter((r) => r.endTime && r.endTime.getTime() <= asOf.getTime())
      .sort((a, b) => a.endTime!.getTime() - b.endTime!.getTime());
    const first = rows[0];
    if (!first || !countedIds.has(first.sessionId)) continue;
    const cameBack = rows.some(
      (r) =>
        r.sessionId !== first.sessionId &&
        r.selfRegistered &&
        r.endTime!.getTime() > first.endTime!.getTime()
    );
    if (cameBack) growth += 1;
  }
  return growth;
}

/** Lengths (minutes) of the real matches played in the counted sessions. */
export function countedMatchMinutes(
  sessions: AwardSession[],
  counted: SessionVerdict[]
): number[] {
  const countedIds = new Set(counted.map((v) => v.sessionId));
  return sessions
    .filter((s) => countedIds.has(s.id))
    .flatMap((s) => s.matches.filter(isRealMatch))
    .map((m) => minutesBetween(m.startTime, m.endTime!));
}

export interface HostMetricsInput {
  hostId: string;
  sessions: AwardSession[];
  verdicts: SessionVerdict[];
  counted: SessionVerdict[];
  ratings: AwardRating[];
  globalRatingMean: number;
  ignoreAllRatings: boolean;
  dataset: MonthDataset;
}

export function computeHostMetrics(input: HostMetricsInput): HostMetrics {
  const { hostId, counted, dataset } = input;

  // Accounts and guests live in one map; the prefix keeps them apart.
  const sessionsPerPlayer = new Map<string, number>();
  const bump = (key: string) =>
    sessionsPerPlayer.set(key, (sessionsPerPlayer.get(key) ?? 0) + 1);
  for (const verdict of counted) {
    verdict.verifiedUserIds.forEach((userId) => bump(`acct:${userId}`));
    verdict.guestKeys.forEach((key) => bump(key));
  }
  const distinctPlayers = sessionsPerPlayer.size;
  const accountPlayers = [...sessionsPerPlayer.keys()].filter((k) =>
    k.startsWith('acct:')
  ).length;
  const guestPlayers = distinctPlayers - accountPlayers;
  const returningPlayers = [...sessionsPerPlayer.values()].filter(
    (n) => n >= 2
  ).length;

  const ratings = input.ignoreAllRatings ? [] : input.ratings;
  const ratingSum = ratings.reduce((sum, r) => sum + r.rating, 0);

  const finishedSessions = input.verdicts.length;
  const cancelledSessions = dataset.cancelledByHost.get(hostId) ?? 0;
  const totalSessions = finishedSessions + cancelledSessions;

  const host = dataset.users.get(hostId);
  const firstHosted = dataset.firstHostedAt.get(hostId);

  return {
    hostId,
    qualifiedSessions: counted.length,
    activity: counted.reduce((sum, v) => sum + v.weight, 0),
    distinctPlayers,
    accountPlayers,
    guestPlayers,
    reach:
      accountPlayers * PLAYER_WEIGHTS.account +
      guestPlayers * PLAYER_WEIGHTS.guest,
    returningPlayers,
    retention: distinctPlayers ? returningPlayers / distinctPlayers : 0,
    growth: computeGrowth(counted, dataset.participationByUser, dataset.asOf),
    ratingCount: ratings.length,
    ratingAverage: ratings.length ? ratingSum / ratings.length : null,
    quality: bayesianRating(ratingSum, ratings.length, input.globalRatingMean),
    finishedSessions,
    cancelledSessions,
    cancelRate: totalSessions ? cancelledSessions / totalSessions : 0,
    hostAccountAgeDays: host
      ? Math.floor((dataset.end.getTime() - host.createdAt.getTime()) / DAY_MS)
      : 0,
    hostingAgeDays: firstHosted
      ? Math.floor((dataset.end.getTime() - firstHosted.getTime()) / DAY_MS)
      : null,
    medianMatchMinutes: median(countedMatchMinutes(input.sessions, counted)),
  };
}

export interface EligibilityCheck {
  eligible: boolean;
  requirements: {
    code: string;
    current: number;
    required: number;
    met: boolean;
  }[];
}

/** Gate before ranking; also drives the host's "my progress" view. */
export function checkEligibility(
  metrics: HostMetrics,
  sanctioned: boolean
): EligibilityCheck {
  const requirements = [
    {
      code: 'HOST_ACCOUNT_AGE_DAYS',
      current: metrics.hostAccountAgeDays,
      required: ELIGIBILITY.minHostAccountAgeDays,
      met: metrics.hostAccountAgeDays >= ELIGIBILITY.minHostAccountAgeDays,
    },
    {
      code: 'QUALIFIED_SESSIONS',
      current: metrics.qualifiedSessions,
      required: ELIGIBILITY.minQualifiedSessions,
      met: metrics.qualifiedSessions >= ELIGIBILITY.minQualifiedSessions,
    },
    {
      code: 'DISTINCT_PLAYERS',
      current: metrics.distinctPlayers,
      required: ELIGIBILITY.minDistinctPlayers,
      met: metrics.distinctPlayers >= ELIGIBILITY.minDistinctPlayers,
    },
    {
      code: 'MAX_CANCEL_RATE',
      current: metrics.cancelRate,
      required: ELIGIBILITY.maxCancelRate,
      met: metrics.cancelRate <= ELIGIBILITY.maxCancelRate,
    },
    {
      code: 'NOT_SANCTIONED',
      current: sanctioned ? 0 : 1,
      required: 1,
      met: !sanctioned,
    },
  ];
  return {
    eligible: requirements.every((r) => r.met),
    requirements,
  };
}
