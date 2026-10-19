import { DAY_MS, MINUTE_MS } from './host-awards.constants';
import {
  AwardMatch,
  AwardSession,
  AwardUser,
  MonthDataset,
} from './host-awards.types';

/** Test builders shared by the host-awards specs. */
export const MONTH_START = new Date('2026-08-31T17:00:00Z'); // 2026-09-01 VN
export const MONTH_END = new Date('2026-09-30T17:00:00Z'); // 2026-10-01 VN

export const at = (day: number, hour = 12, minute = 0) =>
  new Date(Date.UTC(2026, 8, day, hour - 7, minute));

export function user(
  id: string,
  overrides: Partial<AwardUser> = {}
): AwardUser {
  return {
    id,
    createdAt: new Date(MONTH_START.getTime() - 200 * DAY_MS),
    isAdmin: false,
    ...overrides,
  };
}

export function match(
  start: Date,
  minutes: number,
  playerIds: string[]
): AwardMatch {
  return {
    status: 'FINISHED',
    startTime: start,
    endTime: new Date(start.getTime() + minutes * MINUTE_MS),
    playerIds,
  };
}

/**
 * A session where `userIds` registered themselves, `guests` named guests
 * joined without an account, and everyone played a few 15-minute matches
 * across a two-hour slot.
 */
export function session(
  id: string,
  hostId: string,
  start: Date,
  userIds: string[],
  options: {
    minutes?: number;
    matchMinutes?: number;
    matchCount?: number;
    hostLinked?: boolean;
    isInternal?: boolean;
    guests?: string[];
  } = {}
): AwardSession {
  const minutes = options.minutes ?? 120;
  const accountPlayers = userIds.map((userId, index) => ({
    id: `${id}-p${index}`,
    userId,
    createdByUserId: options.hostLinked ? hostId : userId,
    matchesPlayed: 2,
    name: null,
    profileId: null,
  }));
  const guestPlayers = (options.guests ?? []).map((name, index) => ({
    id: `${id}-g${index}`,
    userId: null,
    createdByUserId: null,
    matchesPlayed: 2,
    name,
    profileId: null,
  }));
  const players = [...accountPlayers, ...guestPlayers];
  const playerIds = players.map((p) => p.id);
  const matches = Array.from({ length: options.matchCount ?? 3 }, (_, i) =>
    match(
      new Date(start.getTime() + i * 20 * MINUTE_MS),
      options.matchMinutes ?? 15,
      playerIds
    )
  );
  return {
    id,
    hostId,
    startTime: start,
    endTime: new Date(start.getTime() + minutes * MINUTE_MS),
    isInternal: options.isInternal ?? false,
    players,
    matches,
  };
}

export function dataset(
  sessions: AwardSession[],
  users: AwardUser[],
  overrides: Partial<MonthDataset> = {}
): MonthDataset {
  const participationByUser: MonthDataset['participationByUser'] = new Map();
  for (const s of sessions) {
    for (const p of s.players) {
      if (!p.userId) continue;
      const rows = participationByUser.get(p.userId) ?? [];
      rows.push({
        sessionId: s.id,
        hostId: s.hostId,
        endTime: s.endTime,
        selfRegistered: p.createdByUserId === p.userId,
      });
      participationByUser.set(p.userId, rows);
    }
  }
  return {
    start: MONTH_START,
    end: MONTH_END,
    asOf: new Date(MONTH_END.getTime() + 7 * DAY_MS),
    sessions,
    cancelledByHost: new Map(),
    users: new Map(users.map((u) => [u.id, u])),
    deviceIdsByUser: new Map(),
    ratings: [],
    participationByUser,
    blocks: [],
    firstHostedAt: new Map(),
    sanctionedHostIds: new Set(),
    ...overrides,
  };
}
