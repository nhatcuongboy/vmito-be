import { DAY_MS, MINUTE_MS, QUALIFICATION } from './host-awards.constants';
import { AwardMatch, AwardSession, AwardUser } from './host-awards.types';

export type SessionRejection =
  | 'MISSING_TIMES'
  | 'TOO_SHORT'
  | 'TOO_FEW_MATCHES'
  | 'TOO_FEW_PLAYERS';

export interface SessionVerdict {
  sessionId: string;
  hostId: string;
  endTime: Date;
  qualified: boolean;
  rejection: SessionRejection | null;
  verifiedUserIds: string[];
  weight: number;
}

const VN_UTC_OFFSET_MS = 7 * 3_600_000;

export const minutesBetween = (start: Date, end: Date) =>
  (end.getTime() - start.getTime()) / MINUTE_MS;

/** Calendar day in Vietnam time, e.g. "2026-10-17". */
export const vnDayKey = (date: Date) =>
  new Date(date.getTime() + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);

/** A match that really happened: finished and long enough to be a game. */
export function isRealMatch(match: AwardMatch): boolean {
  return (
    match.status === 'FINISHED' &&
    match.endTime !== null &&
    minutesBetween(match.startTime, match.endTime) >=
      QUALIFICATION.minMatchMinutes
  );
}

/**
 * Accounts that genuinely played for the host. A slot only counts when the
 * account registered itself (`createdByUserId === userId`) — slots the host
 * created or re-linked to someone else's account never count, which is what
 * stops a host from attaching arbitrary accounts to inflate numbers.
 */
export function verifiedPlayerUserIds(
  session: AwardSession,
  users: Map<string, AwardUser>,
  excludedUserIds: ReadonlySet<string>
): string[] {
  const realPlayerIds = new Set(
    session.matches.filter(isRealMatch).flatMap((m) => m.playerIds)
  );
  const reference = session.startTime ?? session.endTime;
  const verified = new Set<string>();

  for (const player of session.players) {
    const userId = player.userId;
    if (!userId || userId === session.hostId) continue;
    if (player.createdByUserId !== userId) continue;
    if (player.matchesPlayed < 1 || !realPlayerIds.has(player.id)) continue;
    if (excludedUserIds.has(userId)) continue;

    const user = users.get(userId);
    if (!user || user.isAdmin) continue;
    // Unverified email accounts are cheap to mass-create; they only count
    // once they also play with some other host on their own.
    const playsElsewhere = [...user.hostsPlayed].some(
      (hostId) => hostId !== session.hostId
    );
    if (!user.trusted && !playsElsewhere) continue;
    const ageDays = reference
      ? (reference.getTime() - user.createdAt.getTime()) / DAY_MS
      : 0;
    if (ageDays < QUALIFICATION.minPlayerAccountAgeDays) continue;

    verified.add(userId);
  }
  return [...verified];
}

export function qualifySession(
  session: AwardSession,
  users: Map<string, AwardUser>,
  excludedUserIds: ReadonlySet<string>
): SessionVerdict | null {
  if (!session.endTime) return null;
  const base = {
    sessionId: session.id,
    hostId: session.hostId,
    endTime: session.endTime,
    weight: session.isInternal ? QUALIFICATION.internalSessionWeight : 1,
  };
  const reject = (rejection: SessionRejection): SessionVerdict => ({
    ...base,
    qualified: false,
    rejection,
    verifiedUserIds: [],
  });

  if (!session.startTime) return reject('MISSING_TIMES');
  if (
    minutesBetween(session.startTime, session.endTime) <
    QUALIFICATION.minSessionMinutes
  ) {
    return reject('TOO_SHORT');
  }
  if (
    session.matches.filter(isRealMatch).length <
    QUALIFICATION.minFinishedMatches
  ) {
    return reject('TOO_FEW_MATCHES');
  }
  const verifiedUserIds = verifiedPlayerUserIds(
    session,
    users,
    excludedUserIds
  );
  if (verifiedUserIds.length < QUALIFICATION.minVerifiedPlayers) {
    return reject('TOO_FEW_PLAYERS');
  }
  return { ...base, qualified: true, rejection: null, verifiedUserIds };
}

/**
 * Keeps the qualified sessions that count after the anti-grinding caps
 * (per Vietnam day and per month), earliest first.
 */
export function applySessionCaps(verdicts: SessionVerdict[]): SessionVerdict[] {
  const qualified = verdicts
    .filter((v) => v.qualified)
    .sort((a, b) => a.endTime.getTime() - b.endTime.getTime());
  const perDay = new Map<string, number>();
  const counted: SessionVerdict[] = [];

  for (const verdict of qualified) {
    if (counted.length >= QUALIFICATION.maxSessionsPerMonth) break;
    const day = vnDayKey(verdict.endTime);
    const used = perDay.get(day) ?? 0;
    if (used >= QUALIFICATION.maxSessionsPerDay) continue;
    perDay.set(day, used + 1);
    counted.push(verdict);
  }
  return counted;
}
