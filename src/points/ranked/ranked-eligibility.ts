import { PointReason } from '@prisma/client';
import { RANKED } from './ranked.constants';

/**
 * Pure rules deciding whether a casual match counts toward the verified
 * ranking, and for whom.
 *
 * - Only real accounts earn points; guests are skipped (they still count as
 *   opponents for the real players).
 * - The session's organisers (host and co-hosts) earn nothing from matches in
 *   their own session: hosts are honoured on their own board, and an
 *   organiser controls who plays and what result is recorded.
 * - Teams come from `winnerIds`, not seat positions: the seat→team mapping
 *   depends on the court's drawing direction, which the server never sees.
 *   That is also why draws are ineligible (a doubles draw has no known split).
 */

export type IneligibleReason =
  | 'NOT_FINISHED'
  | 'NO_RESULT'
  | 'DRAW'
  | 'DUPLICATE_ACCOUNT'
  | 'INVALID_WINNERS'
  | 'TOO_SHORT'
  | 'CRAWLED_SESSION'
  | 'NO_RANKED_PLAYER'
  | 'EDITED_LATE';

export interface EligibilityPlayer {
  playerId: string;
  userId: string | null;
}

export interface EligibilityInput {
  status: string;
  startTime: Date;
  endTime: Date | null;
  winnerIds: string | null;
  isDraw: boolean | null;
  isCrawledSession: boolean;
  players: EligibilityPlayer[];
  /** Host and co-hosts of the session. */
  organizerUserIds: string[];
}

export interface RankedSide {
  reason: Extract<PointReason, 'SESSION_MATCH_WIN' | 'SESSION_MATCH_LOSS'>;
  /** Real, non-organiser accounts on this side: they get a ledger row. */
  rankedUserIds: string[];
  /** Real accounts on the other side (organisers included). */
  opponentUserIds: string[];
  /** Guests on the other side. */
  guestOpponents: number;
}

export type EligibilityResult =
  | { eligible: true; matchMinutes: number; sides: RankedSide[] }
  | { eligible: false; reason: IneligibleReason };

export function parsePlayerIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
    return typeof parsed === 'string' ? [parsed] : [];
  } catch {
    return [raw];
  }
}

export function matchMinutes(startTime: Date, endTime: Date | null): number {
  if (!endTime) return 0;
  return Math.max(
    0,
    Math.floor((endTime.getTime() - startTime.getTime()) / 60_000)
  );
}

export function evaluateEligibility(
  input: EligibilityInput
): EligibilityResult {
  const fail = (reason: IneligibleReason): EligibilityResult => ({
    eligible: false,
    reason,
  });

  if (input.status !== 'FINISHED' || !input.endTime) {
    return fail('NOT_FINISHED');
  }
  if (input.isCrawledSession) return fail('CRAWLED_SESSION');
  if (input.isDraw) return fail('DRAW');

  const winners = new Set(parsePlayerIds(input.winnerIds));
  if (winners.size === 0) return fail('NO_RESULT');

  const { players } = input;
  // Winners must be exactly one side: every id belongs to the match, and the
  // count is half the players (1 in singles, 2 in doubles).
  const playerIds = new Set(players.map((p) => p.playerId));
  if (
    (players.length !== 2 && players.length !== 4) ||
    ![...winners].every((id) => playerIds.has(id)) ||
    winners.size !== players.length / 2
  ) {
    return fail('INVALID_WINNERS');
  }

  const userIds = players.map((p) => p.userId).filter(isString);
  if (new Set(userIds).size !== userIds.length) {
    return fail('DUPLICATE_ACCOUNT');
  }

  const minutes = matchMinutes(input.startTime, input.endTime);
  if (minutes < RANKED.minMatchMinutes) return fail('TOO_SHORT');

  const organizers = new Set(input.organizerUserIds);
  const winSide = players.filter((p) => winners.has(p.playerId));
  const loseSide = players.filter((p) => !winners.has(p.playerId));
  const side = (
    reason: RankedSide['reason'],
    own: EligibilityPlayer[],
    other: EligibilityPlayer[]
  ): RankedSide => ({
    reason,
    rankedUserIds: own
      .map((p) => p.userId)
      .filter(isString)
      .filter((id) => !organizers.has(id)),
    opponentUserIds: other.map((p) => p.userId).filter(isString),
    guestOpponents: other.filter((p) => !p.userId).length,
  });
  const sides = [
    side('SESSION_MATCH_WIN', winSide, loseSide),
    side('SESSION_MATCH_LOSS', loseSide, winSide),
  ];
  if (sides.every((s) => s.rankedUserIds.length === 0)) {
    return fail('NO_RANKED_PLAYER');
  }
  return { eligible: true, matchMinutes: minutes, sides };
}

export function isLateEdit(endTime: Date | null, now: Date): boolean {
  if (!endTime) return false;
  return now.getTime() - endTime.getTime() > RANKED.lateEditDays * 86_400_000;
}

function isString(value: string | null): value is string {
  return typeof value === 'string';
}
