import {
  ScoringSet,
  MatchFormatValue,
  matchWinnerSide,
  setWins,
  currentSet,
  Side,
  ScoringRules,
} from './badminton-scoring';
import { getTournamentSportProfile } from '../../tournaments/sport-profiles';

// ─── Structural input shape (subset of the Prisma include used everywhere) ───

interface PlayerLike {
  name: string | null;
}

interface PairMemberLike {
  player?: PlayerLike | null;
}

interface PairLike {
  name?: string | null;
  members?: PairMemberLike[] | null;
}

interface RegistrationLike {
  id: string;
  player?: PlayerLike | null;
  pair?: PairLike | null;
}

interface ParticipantLike {
  position: number;
  categoryRegistration?: RegistrationLike | null;
}

interface CourtLike {
  id: string;
  courtNumber: number;
  courtName?: string | null;
}

export interface NormalizableMatch {
  id: string;
  categoryId: string;
  round: string;
  matchNumber: number;
  status: string;
  score: string | null;
  sets: unknown;
  winnerId: string | null;
  isDraw: boolean;
  matchFormat: string | null;
  startTime: Date | null;
  endTime: Date | null;
  estimatedEndTime: Date | null;
  updatedAt: Date;
  courtId: string | null;
  court?: CourtLike | null;
  participants?: ParticipantLike[] | null;
  category?: {
    id: string;
    name: string;
    tournamentId: string;
    matchFormat?: string | null;
    pointsToWin?: number | null;
    winByTwo?: boolean | null;
    pointCap?: number | null;
    knockoutPointsToWin?: number | null;
    knockoutWinByTwo?: boolean | null;
    knockoutPointCap?: number | null;
    finalPointsToWin?: number | null;
    finalWinByTwo?: boolean | null;
    finalPointCap?: number | null;
    tournament?: { sportType?: 'BADMINTON' | 'PICKLEBALL' | null } | null;
  } | null;
  referee?: { id: string; name: string } | null;
}

export interface ScoreboardSide {
  registrationId: string | null;
  name: string;
  players: string[];
}

export interface ScoreboardMatchPayload {
  matchId: string;
  tournamentId: string | null;
  categoryId: string;
  categoryName: string | null;
  round: string;
  matchNumber: number;
  status: string;
  court: { id: string; courtNumber: number; courtName: string | null } | null;
  matchFormat: string | null;
  refereeName: string | null;
  side1: ScoreboardSide;
  side2: ScoreboardSide;
  sets: ScoringSet[];
  score: string | null;
  currentSet: { setNumber: number; side1: number; side2: number } | null;
  setWins: { side1: number; side2: number };
  winnerId: string | null;
  isDraw: boolean;
  isComplete: boolean;
  pendingWinnerId: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedEndTime: string | null;
  updatedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function resolveSide(
  participants: ParticipantLike[] | null | undefined,
  position: number
): ScoreboardSide {
  const participant = participants?.find((p) => p.position === position);
  const reg = participant?.categoryRegistration;
  if (!reg) {
    return { registrationId: null, name: 'TBD', players: [] };
  }
  if (reg.pair?.members && reg.pair.members.length > 0) {
    const players = reg.pair.members.map((m) => m.player?.name || '?');
    return {
      registrationId: reg.id,
      name: reg.pair.name || players.join(' / '),
      players,
    };
  }
  const name = reg.player?.name || 'Unknown';
  return { registrationId: reg.id, name, players: [name] };
}

function parseSets(raw: unknown): ScoringSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is ScoringSet => !!s && typeof s === 'object')
    .map((s) => ({
      setNumber: Number(s.setNumber) || 0,
      player1Score: Number(s.player1Score) || 0,
      player2Score: Number(s.player2Score) || 0,
      ...(s.player3Score !== undefined && {
        player3Score: Number(s.player3Score) || 0,
      }),
      ...(s.player4Score !== undefined && {
        player4Score: Number(s.player4Score) || 0,
      }),
    }));
}

type ScoringStage = 'GROUP' | 'KNOCKOUT' | 'FINAL';

function stageOfRound(round: string): ScoringStage {
  if (round === 'GROUP') return 'GROUP';
  if (round === 'F' || round === 'GF' || round === 'GF2') return 'FINAL';
  return 'KNOCKOUT';
}

function resolveRules(match: NormalizableMatch): ScoringRules {
  const category = match.category;
  const fallback = getTournamentSportProfile(
    category?.tournament?.sportType
  ).defaultScoring;
  if (!category) {
    return {
      pointsToWin: fallback.pointsToWin,
      winByTwo: fallback.winByTwo,
      pointCap: fallback.pointCap,
    };
  }

  const stage = stageOfRound(match.round);
  const pointsToWin =
    stage === 'FINAL'
      ? (category.finalPointsToWin ??
        category.knockoutPointsToWin ??
        category.pointsToWin ??
        fallback.pointsToWin)
      : stage === 'KNOCKOUT'
        ? (category.knockoutPointsToWin ??
          category.pointsToWin ??
          fallback.pointsToWin)
        : (category.pointsToWin ?? fallback.pointsToWin);
  const winByTwo =
    stage === 'FINAL'
      ? (category.finalWinByTwo ??
        category.knockoutWinByTwo ??
        category.winByTwo ??
        fallback.winByTwo)
      : stage === 'KNOCKOUT'
        ? (category.knockoutWinByTwo ?? category.winByTwo ?? fallback.winByTwo)
        : (category.winByTwo ?? fallback.winByTwo);

  const baseCap =
    category.pointCap !== undefined ? category.pointCap : fallback.pointCap;
  const pointCap =
    stage === 'FINAL'
      ? category.finalPointCap !== null && category.finalPointCap !== undefined
        ? category.finalPointCap
        : category.knockoutPointCap !== null &&
            category.knockoutPointCap !== undefined
          ? category.knockoutPointCap
          : baseCap
      : stage === 'KNOCKOUT'
        ? category.knockoutPointCap !== null &&
          category.knockoutPointCap !== undefined
          ? category.knockoutPointCap
          : baseCap
        : baseCap;

  return { pointsToWin, winByTwo, pointCap };
}

/**
 * Convert a Prisma match (with the standard participant/court/category include)
 * into a flat, grid-friendly payload. Reused by both the WebSocket broadcast and
 * the public scoreboard HTTP endpoint so the shapes are always identical.
 */
export function normalizeMatchForBroadcast(
  match: NormalizableMatch
): ScoreboardMatchPayload {
  const sets = parseSets(match.sets);
  const format = (match.matchFormat ||
    match.category?.matchFormat ||
    getTournamentSportProfile(match.category?.tournament?.sportType)
      .defaultScoring.matchFormat) as MatchFormatValue;
  const rules = resolveRules(match);

  const current = currentSet(sets);
  const pendingSide: Side | null = matchWinnerSide(sets, format, rules);

  const side1 = resolveSide(match.participants, 1);
  const side2 = resolveSide(match.participants, 2);

  const pendingWinnerId =
    pendingSide === 1
      ? side1.registrationId
      : pendingSide === 2
        ? side2.registrationId
        : null;

  return {
    matchId: match.id,
    tournamentId: match.category?.tournamentId ?? null,
    categoryId: match.categoryId,
    categoryName: match.category?.name ?? null,
    round: match.round,
    matchNumber: match.matchNumber,
    status: match.status,
    court: match.court
      ? {
          id: match.court.id,
          courtNumber: match.court.courtNumber,
          courtName: match.court.courtName ?? null,
        }
      : null,
    matchFormat: match.matchFormat ?? match.category?.matchFormat ?? null,
    refereeName: match.referee?.name ?? null,
    side1,
    side2,
    sets,
    score: match.score,
    currentSet: current
      ? {
          setNumber: current.setNumber,
          side1: current.player1Score,
          side2: current.player2Score,
        }
      : null,
    setWins: setWins(sets, rules),
    winnerId: match.winnerId,
    isDraw: match.isDraw,
    isComplete: pendingSide !== null,
    pendingWinnerId,
    startTime: match.startTime ? match.startTime.toISOString() : null,
    endTime: match.endTime ? match.endTime.toISOString() : null,
    estimatedEndTime: match.estimatedEndTime
      ? match.estimatedEndTime.toISOString()
      : null,
    updatedAt: match.updatedAt.toISOString(),
  };
}
