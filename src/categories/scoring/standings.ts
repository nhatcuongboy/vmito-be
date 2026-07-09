/**
 * Pure, stateless round-robin standings computation.
 *
 * Kept free of Prisma/Nest so it can be unit-tested in isolation. The service
 * fetches the group registrations + finished matches, maps them onto the input
 * shapes below, and delegates the actual point/tiebreaker maths to here.
 *
 * Points modes (formatConfig.roundRobin.pointsEarning):
 *  - 'match_results'   : points derived from win/tie/loss + game + forfeit points.
 *  - 'manual'          : points come straight from per-match player1Points/player2Points.
 *  - 'tiebreakers_only': every point weight is forced to 0; ranking relies purely
 *                        on the configured tiebreakers.
 *
 * Tiebreakers are resolved with a recursive mini-table: a tied bucket is split by
 * one criterion at a time, and head-to-head style criteria are recomputed using
 * ONLY the matches played among the currently-tied teams (so 3+ way ties resolve
 * correctly and transitively). A unique per-entrant seed is the final, fully
 * deterministic fallback.
 */

export type PointsEarning = 'match_results' | 'manual' | 'tiebreakers_only';

export interface StandingsConfig {
  pointsEarning: PointsEarning;
  winPoints: number;
  tiePoints: number;
  lossPoints: number;
  cancelledMatchPoints: number;
  gameWinPoints: number;
  gameLossPoints: number;
  forfeitWinPoints: number;
  forfeitLossPoints: number;
  tiebreakers: Array<{ id: string }>;
  /** Sub-tiebreakers applied (as a mini-table) right after `head_to_head`. */
  headToHeadTiebreakers: Array<{ id: string }>;
}

export interface StandingsMatchInput {
  participants: Array<{ categoryRegistrationId: string; position: number }>;
  player1Score: number | null;
  player2Score: number | null;
  /** Manually-assigned standings points (used only in `manual` mode). */
  player1Points?: number | null;
  player2Points?: number | null;
  sets?: Array<{ player1Score?: number; player2Score?: number }> | null;
  winnerId: string | null;
  isDraw: boolean;
  isForfeit: boolean;
  /** A cancelled match: counted for cancelledMatchPoints only, never played. */
  isCancelled: boolean;
}

/** Order of entrants defines the deterministic tiebreaker seed (index). */
export interface StandingsEntrantInput {
  categoryRegistrationId: string;
}

export interface StandingRow {
  categoryRegistrationId: string;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  matchesForfeited: number;
  matchesCancelled: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
  /** Outcomes of the 5 most recent played matches, oldest → newest. */
  recentForm: Array<'W' | 'L' | 'D'>;
  rank: number;
}

type Row = StandingRow & { seed: number };

const DEFAULT_TIEBREAKERS: Array<{ id: string }> = [
  { id: 'total_points' },
  { id: 'game_differential' },
  { id: 'total_wins' },
  { id: 'point_differential' },
];

/** Head-to-head style criteria are scored against the tied bucket, not globally. */
const H2H_CRITERIA = new Set(['head_to_head', 'matchups']);

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Normalise a raw category.formatConfig into a fully-defaulted StandingsConfig.
 * Supports both flat round-robin configs and RR→SE configs (nested `roundRobin`).
 */
export function resolveStandingsConfig(
  config: Record<string, unknown> | null | undefined
): StandingsConfig {
  const rr = (config?.roundRobin as Record<string, unknown>) ?? config ?? {};

  const pointsEarning = (rr.pointsEarning as PointsEarning) ?? 'match_results';
  const zero = pointsEarning === 'tiebreakers_only';

  const tiebreakers =
    Array.isArray(rr.tiebreakers) && rr.tiebreakers.length > 0
      ? (rr.tiebreakers as Array<{ id: string }>)
      : DEFAULT_TIEBREAKERS;

  return {
    pointsEarning,
    winPoints: zero ? 0 : num(rr.winPoints, 2),
    tiePoints: zero ? 0 : num(rr.tiePoints, 0),
    lossPoints: zero ? 0 : num(rr.lossPoints, 1),
    cancelledMatchPoints: zero ? 0 : num(rr.cancelledMatchPoints, 0),
    gameWinPoints: zero ? 0 : num(rr.gameWinPoints, 0),
    gameLossPoints: zero ? 0 : num(rr.gameLossPoints, 0),
    forfeitWinPoints: zero ? 0 : num(rr.forfeitWinPoints, 0),
    forfeitLossPoints: zero ? 0 : num(rr.forfeitLossPoints, 0),
    tiebreakers,
    headToHeadTiebreakers: Array.isArray(rr.headToHeadTiebreakers)
      ? (rr.headToHeadTiebreakers as Array<{ id: string }>)
      : [],
  };
}

/** Count games won by each side within a single match from its sets. */
function gamesOf(match: StandingsMatchInput): { s1: number; s2: number } {
  let s1 = 0;
  let s2 = 0;
  if (Array.isArray(match.sets)) {
    for (const set of match.sets) {
      const a = set.player1Score ?? 0;
      const b = set.player2Score ?? 0;
      if (a > b) s1++;
      else if (b > a) s2++;
    }
  }
  return { s1, s2 };
}

export function computeStandings(
  entrants: StandingsEntrantInput[],
  matches: StandingsMatchInput[],
  config: StandingsConfig
): StandingRow[] {
  const rows = new Map<string, Row>();
  entrants.forEach((e, seed) => {
    rows.set(e.categoryRegistrationId, {
      categoryRegistrationId: e.categoryRegistrationId,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      matchesDrawn: 0,
      matchesForfeited: 0,
      matchesCancelled: 0,
      points: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDifference: 0,
      recentForm: [],
      rank: 0,
      seed,
    });
  });

  const manual = config.pointsEarning === 'manual';

  for (const match of matches) {
    const p1 = match.participants.find((p) => p.position === 1);
    const p2 = match.participants.find((p) => p.position === 2);
    if (!p1 || !p2) continue;

    const s1 = rows.get(p1.categoryRegistrationId);
    const s2 = rows.get(p2.categoryRegistrationId);
    if (!s1 || !s2) continue;

    // A cancelled match is never "played": both sides just collect the
    // configured cancelled-match points (skipped entirely in manual mode).
    if (match.isCancelled) {
      s1.matchesCancelled++;
      s2.matchesCancelled++;
      if (!manual) {
        s1.points += config.cancelledMatchPoints;
        s2.points += config.cancelledMatchPoints;
      }
      continue;
    }

    s1.matchesPlayed++;
    s2.matchesPlayed++;

    s1.pointsFor += match.player1Score ?? 0;
    s1.pointsAgainst += match.player2Score ?? 0;
    s2.pointsFor += match.player2Score ?? 0;
    s2.pointsAgainst += match.player1Score ?? 0;

    // Games won/lost are scoped to THIS match, then accumulated (the previous
    // implementation multiplied game points by the running cumulative total).
    const { s1: s1Games, s2: s2Games } = gamesOf(match);
    s1.gamesWon += s1Games;
    s1.gamesLost += s2Games;
    s2.gamesWon += s2Games;
    s2.gamesLost += s1Games;

    const winner = match.isDraw
      ? null
      : match.winnerId === p1.categoryRegistrationId
        ? s1
        : match.winnerId === p2.categoryRegistrationId
          ? s2
          : null;
    const loser = winner === s1 ? s2 : winner === s2 ? s1 : null;

    // Win/loss/draw bookkeeping is independent of the points mode so that
    // tiebreakers and stat columns stay meaningful even in manual mode.
    if (match.isDraw) {
      s1.matchesDrawn++;
      s2.matchesDrawn++;
      s1.recentForm.push('D');
      s2.recentForm.push('D');
    } else if (winner && loser) {
      winner.matchesWon++;
      loser.matchesLost++;
      winner.recentForm.push('W');
      loser.recentForm.push('L');
      if (match.isForfeit) loser.matchesForfeited++;
    }

    if (manual) {
      s1.points += match.player1Points ?? 0;
      s2.points += match.player2Points ?? 0;
      continue;
    }

    if (match.isDraw) {
      s1.points += config.tiePoints;
      s2.points += config.tiePoints;
    } else if (winner && loser) {
      winner.points += match.isForfeit
        ? config.forfeitWinPoints
        : config.winPoints;
      loser.points += match.isForfeit
        ? config.forfeitLossPoints
        : config.lossPoints;
    }

    // Per-match game points (a forfeit with no sets contributes nothing).
    s1.points +=
      s1Games * config.gameWinPoints + s2Games * config.gameLossPoints;
    s2.points +=
      s2Games * config.gameWinPoints + s1Games * config.gameLossPoints;
  }

  const all = Array.from(rows.values());
  all.forEach((r) => {
    r.pointDifference = r.pointsFor - r.pointsAgainst;
    r.gameDifference = r.gamesWon - r.gamesLost;
    // Keep only the 5 most recent outcomes (matches are processed oldest-first).
    r.recentForm = r.recentForm.slice(-5);
  });

  const criteria = buildCriteria(config);
  const ordered = resolveBucket(all, 0, criteria, matches);
  ordered.forEach((r, i) => (r.rank = i + 1));

  return ordered.map(({ seed: _seed, ...row }) => row);
}

interface Criterion {
  id: string;
  scope: 'global' | 'h2h';
}

/**
 * Flatten the configured tiebreakers into an ordered criterion list, splicing
 * the head-to-head sub-tiebreakers in right after `head_to_head` (scored as a
 * mini-table among the tied teams).
 */
function buildCriteria(config: StandingsConfig): Criterion[] {
  const out: Criterion[] = [];
  for (const tb of config.tiebreakers) {
    out.push({ id: tb.id, scope: H2H_CRITERIA.has(tb.id) ? 'h2h' : 'global' });
    if (tb.id === 'head_to_head') {
      for (const sub of config.headToHeadTiebreakers) {
        out.push({ id: sub.id, scope: 'h2h' });
      }
    }
  }
  return out;
}

/**
 * Recursively order a bucket of tied rows. At each criterion the bucket is split
 * into sub-buckets of equal key (higher key = better), and each sub-bucket is
 * resolved by the next criterion. Buckets that survive every criterion fall back
 * to the deterministic seed order.
 */
function resolveBucket(
  bucket: Row[],
  index: number,
  criteria: Criterion[],
  matches: StandingsMatchInput[]
): Row[] {
  if (bucket.length <= 1 || index >= criteria.length) {
    return [...bucket].sort((a, b) => a.seed - b.seed);
  }

  const crit = criteria[index];
  const keyOf =
    crit.scope === 'h2h'
      ? buildH2HKeyFn(crit.id, bucket, matches)
      : (r: Row) => globalKey(crit.id, r);

  // Sign-based compare (descending) so Infinity-valued keys (e.g. an unbeaten
  // games ratio) never produce NaN from an Infinity - Infinity subtraction.
  const sorted = [...bucket].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka === kb ? 0 : kb > ka ? 1 : -1;
  });

  const result: Row[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && keyOf(sorted[j]) === keyOf(sorted[i])) j++;
    result.push(
      ...resolveBucket(sorted.slice(i, j), index + 1, criteria, matches)
    );
    i = j;
  }
  return result;
}

/** A per-team bundle of every value a tiebreaker metric can be derived from. */
interface Metric {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesForfeited: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
}

/** Per-match average; 0 when no matches were played (avoids NaN). */
const avg = (total: number, played: number): number =>
  played === 0 ? 0 : total / played;

/** won/lost ratio; +Infinity when undefeated, 0 when no games at all. */
const ratio = (won: number, lost: number): number => {
  if (lost === 0) return won === 0 ? 0 : Infinity;
  return won / lost;
};

/**
 * Score a single tiebreaker for a team (higher = better). Shared by the global
 * standings and the head-to-head mini-table. Unknown ids are no-ops (0) so the
 * full set of UI-configurable tiebreakers degrades gracefully.
 */
function metricKey(id: string, m: Metric): number {
  switch (id) {
    case 'total_points':
      return m.points;
    case 'total_wins':
      return m.matchesWon;
    case 'least_losses':
      return -m.matchesLost;
    case 'least_matches_forfeited':
      return -m.matchesForfeited;
    case 'game_differential':
      return m.gameDifference;
    case 'average_game_differential':
      return avg(m.gameDifference, m.matchesPlayed);
    case 'most_games_for':
      return m.gamesWon;
    case 'highest_average_games_for':
      return avg(m.gamesWon, m.matchesPlayed);
    case 'least_games_against':
      return -m.gamesLost;
    case 'lowest_average_games_against':
      return -avg(m.gamesLost, m.matchesPlayed);
    case 'highest_game_ratio':
      return ratio(m.gamesWon, m.gamesLost);
    case 'point_differential':
    case 'point_differential_detail':
      return m.pointDifference;
    case 'average_point_differential':
      return avg(m.pointDifference, m.matchesPlayed);
    case 'points_for':
    case 'most_points_for':
      return m.pointsFor;
    case 'highest_average_points_for':
      return avg(m.pointsFor, m.matchesPlayed);
    case 'points_against':
    case 'least_points_against':
      return -m.pointsAgainst;
    case 'lowest_average_points_against':
      return -avg(m.pointsAgainst, m.matchesPlayed);
    default:
      return 0;
  }
}

/** Global (whole round-robin) metric for a criterion. */
function globalKey(id: string, r: Row): number {
  return metricKey(id, r);
}

interface IntraStats {
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  pointDiff: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Build a key function scoped to the matches played among `bucket` members only
 * (the mini-table). Intra stats are computed once and shared across rows.
 */
function buildH2HKeyFn(
  id: string,
  bucket: Row[],
  matches: StandingsMatchInput[]
): (r: Row) => number {
  const intra = intraGroupStats(bucket, matches);
  return (r: Row) => h2hKey(id, intra.get(r.categoryRegistrationId));
}

function intraGroupStats(
  bucket: Row[],
  matches: StandingsMatchInput[]
): Map<string, IntraStats> {
  const ids = new Set(bucket.map((r) => r.categoryRegistrationId));
  const map = new Map<string, IntraStats>();
  for (const r of bucket) {
    map.set(r.categoryRegistrationId, {
      played: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
      pointDiff: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  for (const m of matches) {
    if (m.isCancelled) continue;
    const p1 = m.participants.find((p) => p.position === 1);
    const p2 = m.participants.find((p) => p.position === 2);
    if (!p1 || !p2) continue;
    if (
      !ids.has(p1.categoryRegistrationId) ||
      !ids.has(p2.categoryRegistrationId)
    ) {
      continue;
    }

    const a = map.get(p1.categoryRegistrationId)!;
    const b = map.get(p2.categoryRegistrationId)!;
    const sc1 = m.player1Score ?? 0;
    const sc2 = m.player2Score ?? 0;

    a.played++;
    b.played++;
    a.pointsFor += sc1;
    a.pointsAgainst += sc2;
    a.pointDiff += sc1 - sc2;
    b.pointsFor += sc2;
    b.pointsAgainst += sc1;
    b.pointDiff += sc2 - sc1;

    const { s1, s2 } = gamesOf(m);
    a.gamesWon += s1;
    a.gamesLost += s2;
    b.gamesWon += s2;
    b.gamesLost += s1;
    a.gameDiff += s1 - s2;
    b.gameDiff += s2 - s1;

    if (!m.isDraw) {
      if (m.winnerId === p1.categoryRegistrationId) {
        a.wins++;
        b.losses++;
      } else if (m.winnerId === p2.categoryRegistrationId) {
        b.wins++;
        a.losses++;
      }
    }
  }
  return map;
}

/** Mini-table metric for a criterion (scoped to matches among tied teams). */
function h2hKey(id: string, s: IntraStats | undefined): number {
  if (!s) return 0;
  if (id === 'head_to_head') return s.wins - s.losses;
  if (id === 'matchups') return s.wins;
  return metricKey(id, {
    matchesPlayed: s.played,
    matchesWon: s.wins,
    matchesLost: s.losses,
    matchesForfeited: 0,
    points: 0,
    pointsFor: s.pointsFor,
    pointsAgainst: s.pointsAgainst,
    pointDifference: s.pointDiff,
    gamesWon: s.gamesWon,
    gamesLost: s.gamesLost,
    gameDifference: s.gameDiff,
  });
}
