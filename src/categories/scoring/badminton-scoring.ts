/**
 * Pure, stateless badminton scoring rules used by the live-scoring endpoints.
 *
 * Standard rules: rally to 21, must win by 2, hard cap at 30 (so 30-29 wins).
 * BEST_OF_1 = a single set decides the match; BEST_OF_3 = first to 2 sets;
 * BEST_OF_5 = first to 3 sets.
 *
 * A doubles team shares one score, so we store the side score in
 * player1Score/player2Score and mirror it into player3Score/player4Score only
 * when the match is doubles (to keep the existing `sets` JSON shape consistent).
 */

export const POINTS_TO_WIN_SET = 21;
export const WIN_BY = 2;
export const HARD_CAP = 30;

export type MatchFormatValue = 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5';
export type Side = 1 | 2;

export interface ScoringSet {
  setNumber: number;
  player1Score: number;
  player2Score: number;
  player3Score?: number;
  player4Score?: number;
}

export interface PointLogEntry {
  side: Side;
  setNumber: number;
}

/** True when a set with scores (a, b) is complete under standard rules. */
export function isSetComplete(a: number, b: number): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi >= HARD_CAP) return true; // 30 caps the set (e.g. 30-29)
  return hi >= POINTS_TO_WIN_SET && hi - lo >= WIN_BY;
}

/** Returns the winning side of a set, or null if it is not yet complete. */
export function setWinnerSide(a: number, b: number): Side | null {
  if (!isSetComplete(a, b)) return null;
  return a > b ? 1 : 2;
}

/** Number of sets a side must win to take the match. */
export function setsToWin(format: MatchFormatValue): number {
  if (format === 'BEST_OF_5') return 3;
  if (format === 'BEST_OF_3') return 2;
  return 1;
}

/** Side scores for a set as a [side1, side2] tuple. */
function sideScores(set: ScoringSet): [number, number] {
  return [set.player1Score, set.player2Score];
}

/**
 * Returns the side that has won the match, or null if undecided.
 * Counts completed-set wins and compares against setsToWin(format).
 */
export function matchWinnerSide(
  sets: ScoringSet[],
  format: MatchFormatValue
): Side | null {
  let side1Wins = 0;
  let side2Wins = 0;
  for (const set of sets) {
    const [a, b] = sideScores(set);
    const winner = setWinnerSide(a, b);
    if (winner === 1) side1Wins++;
    else if (winner === 2) side2Wins++;
  }
  const need = setsToWin(format);
  if (side1Wins >= need) return 1;
  if (side2Wins >= need) return 2;
  return null;
}

/** Count of completed sets won by each side. */
export function setWins(sets: ScoringSet[]): { side1: number; side2: number } {
  let side1 = 0;
  let side2 = 0;
  for (const set of sets) {
    const winner = setWinnerSide(set.player1Score, set.player2Score);
    if (winner === 1) side1++;
    else if (winner === 2) side2++;
  }
  return { side1, side2 };
}

/** Ensure at least one (in-progress) set exists. */
function ensureSets(sets: ScoringSet[], isDoubles: boolean): ScoringSet[] {
  if (sets.length === 0) {
    return [newSet(1, isDoubles)];
  }
  return sets.map((s) => ({ ...s }));
}

function newSet(setNumber: number, isDoubles: boolean): ScoringSet {
  const base: ScoringSet = { setNumber, player1Score: 0, player2Score: 0 };
  if (isDoubles) {
    base.player3Score = 0;
    base.player4Score = 0;
  }
  return base;
}

function applyMirror(set: ScoringSet, isDoubles: boolean): ScoringSet {
  if (!isDoubles) return set;
  return {
    ...set,
    player3Score: set.player1Score,
    player4Score: set.player2Score,
  };
}

/**
 * Apply a single point (+1 or -1) for a side to the current set.
 * - Rejects further points once the match is already decided.
 * - Clamps scores at 0 (a -1 at 0 is a no-op).
 * - When the current set completes and the match is not over, opens the next set.
 *
 * Returns the updated sets array (does not mutate the input).
 */
export function applyDelta(
  sets: ScoringSet[],
  side: Side,
  delta: 1 | -1,
  format: MatchFormatValue,
  isDoubles: boolean
): ScoringSet[] {
  const working = ensureSets(sets, isDoubles);

  // Reject scoring once the match is decided (referee must undo to correct).
  if (matchWinnerSide(working, format) !== null) {
    throw new MatchAlreadyDecidedError();
  }

  const current = working[working.length - 1];
  const field = side === 1 ? 'player1Score' : 'player2Score';
  const next = Math.max(0, current[field] + delta);
  current[field] = next;

  const mirrored = applyMirror(current, isDoubles);
  working[working.length - 1] = mirrored;

  // If this set just completed and the match isn't over, open the next set.
  const setDone = isSetComplete(mirrored.player1Score, mirrored.player2Score);
  const matchDone = matchWinnerSide(working, format) !== null;
  if (setDone && !matchDone && delta === 1) {
    working.push(newSet(current.setNumber + 1, isDoubles));
  }

  return working;
}

/** Error thrown when attempting to add a point to an already-decided match. */
export class MatchAlreadyDecidedError extends Error {
  constructor() {
    super('Match is already decided');
    this.name = 'MatchAlreadyDecidedError';
  }
}

/**
 * Rebuild the sets array from a point log (used for exact undo). Replays each
 * logged point through applyDelta semantics, so set rollover is reproduced.
 */
export function rebuildFromLog(
  log: PointLogEntry[],
  format: MatchFormatValue,
  isDoubles: boolean
): ScoringSet[] {
  let sets: ScoringSet[] = [newSet(1, isDoubles)];
  for (const entry of log) {
    sets = applyDelta(sets, entry.side, 1, format, isDoubles);
  }
  return sets;
}

/** Display string e.g. "21-19, 18-21, 21-15" across completed/in-progress sets. */
export function buildScoreString(sets: ScoringSet[]): string {
  return sets
    .filter(
      (s, idx) =>
        // include any set that has points, plus the very first set even at 0-0
        s.player1Score > 0 || s.player2Score > 0 || idx === 0
    )
    .map((s) => `${s.player1Score}-${s.player2Score}`)
    .join(', ');
}

/** Running totals across all sets (used for group-stage point calculations). */
export function totalsFromSets(sets: ScoringSet[], isDoubles: boolean) {
  const player1Score = sets.reduce((sum, s) => sum + s.player1Score, 0);
  const player2Score = sets.reduce((sum, s) => sum + s.player2Score, 0);
  if (!isDoubles) {
    return { player1Score, player2Score };
  }
  return {
    player1Score,
    player2Score,
    player3Score: player1Score,
    player4Score: player2Score,
  };
}

/** The current (last, in-progress) set, or null if no points have been played. */
export function currentSet(sets: ScoringSet[]): ScoringSet | null {
  if (sets.length === 0) return null;
  return sets[sets.length - 1];
}
