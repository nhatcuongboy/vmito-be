import { DAY_MS, MINUTE_MS, QUALIFICATION } from './host-awards.constants';
import {
  AwardMatch,
  AwardPlayer,
  AwardSession,
  AwardUser,
} from './host-awards.types';

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
  /** Accounts that registered themselves and played in a real match. */
  verifiedUserIds: string[];
  /** Named guests (see `guestKey`) who played in a real match. */
  guestKeys: string[];
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
 * Stable identity of a guest slot: the host's roster profile when linked,
 * else the name without case, accents or extra spaces, so "Hùng" and
 * " hung " are one person. A nameless, profile-less slot has no identity and
 * never counts.
 */
export function guestKey(player: AwardPlayer): string | null {
  if (player.profileId) return `profile:${player.profileId}`;
  const name = (player.name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return name ? `name:${name}` : null;
}

export interface CountedPlayers {
  /** Accounts that registered themselves and played in a real match. */
  userIds: string[];
  /** Named guests who played in a real match. */
  guestKeys: string[];
}

/**
 * Who genuinely played for the host in one session.
 *
 * Accounts only count when they registered themselves
 * (`createdByUserId === userId`): slots the host created or re-linked to
 * someone else's account never count, which stops a host attaching arbitrary
 * accounts. Guests have no account to check, so they must at least have
 * played in a real match and carry an identity; admins and the host's own
 * slots never count.
 */
export function countedPlayers(
  session: AwardSession,
  users: Map<string, AwardUser>,
  excludedUserIds: ReadonlySet<string>
): CountedPlayers {
  const realPlayerIds = new Set(
    session.matches.filter(isRealMatch).flatMap((m) => m.playerIds)
  );
  const reference = session.startTime ?? session.endTime;
  const userIds = new Set<string>();
  const guestKeys = new Set<string>();

  for (const player of session.players) {
    if (player.matchesPlayed < 1 || !realPlayerIds.has(player.id)) continue;

    const userId = player.userId;
    if (!userId) {
      const key = guestKey(player);
      if (key) guestKeys.add(key);
      continue;
    }
    if (userId === session.hostId) continue;
    if (player.createdByUserId !== userId) continue;
    if (excludedUserIds.has(userId)) continue;

    const user = users.get(userId);
    if (!user || user.isAdmin) continue;
    const ageDays = reference
      ? (reference.getTime() - user.createdAt.getTime()) / DAY_MS
      : 0;
    if (ageDays < QUALIFICATION.minPlayerAccountAgeDays) continue;

    userIds.add(userId);
  }
  return { userIds: [...userIds], guestKeys: [...guestKeys] };
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
    guestKeys: [],
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
  const players = countedPlayers(session, users, excludedUserIds);
  if (
    players.userIds.length + players.guestKeys.length <
    QUALIFICATION.minCountedPlayers
  ) {
    return reject('TOO_FEW_PLAYERS');
  }
  return {
    ...base,
    qualified: true,
    rejection: null,
    verifiedUserIds: players.userIds,
    guestKeys: players.guestKeys,
  };
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
