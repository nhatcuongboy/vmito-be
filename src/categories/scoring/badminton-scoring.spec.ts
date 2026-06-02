import {
  isSetComplete,
  setWinnerSide,
  matchWinnerSide,
  setWins,
  applyDelta,
  rebuildFromLog,
  buildScoreString,
  totalsFromSets,
  MatchAlreadyDecidedError,
  ScoringSet,
} from './badminton-scoring';

const set = (setNumber: number, a: number, b: number): ScoringSet => ({
  setNumber,
  player1Score: a,
  player2Score: b,
});

describe('badminton-scoring', () => {
  describe('isSetComplete', () => {
    it('completes at 21 with a 2-point lead', () => {
      expect(isSetComplete(21, 19)).toBe(true);
    });
    it('does not complete at 21-20 (deuce)', () => {
      expect(isSetComplete(21, 20)).toBe(false);
    });
    it('completes at 23-21 in deuce', () => {
      expect(isSetComplete(23, 21)).toBe(true);
    });
    it('completes at hard cap 30-29', () => {
      expect(isSetComplete(30, 29)).toBe(true);
    });
    it('does not complete at 29-29', () => {
      expect(isSetComplete(29, 29)).toBe(false);
    });
    it('is incomplete in the early game', () => {
      expect(isSetComplete(11, 5)).toBe(false);
    });
  });

  describe('setWinnerSide', () => {
    it('returns 1 when side 1 wins', () => {
      expect(setWinnerSide(21, 18)).toBe(1);
    });
    it('returns 2 when side 2 wins', () => {
      expect(setWinnerSide(15, 21)).toBe(2);
    });
    it('returns null when undecided', () => {
      expect(setWinnerSide(20, 19)).toBeNull();
    });
  });

  describe('matchWinnerSide', () => {
    it('BEST_OF_1: one set decides the match', () => {
      expect(matchWinnerSide([set(1, 21, 10)], 'BEST_OF_1')).toBe(1);
    });
    it('BEST_OF_3: needs two sets', () => {
      expect(matchWinnerSide([set(1, 21, 10)], 'BEST_OF_3')).toBeNull();
      expect(
        matchWinnerSide([set(1, 21, 10), set(2, 21, 15)], 'BEST_OF_3')
      ).toBe(1);
    });
    it('BEST_OF_3: 1-1 goes to a third set', () => {
      expect(
        matchWinnerSide([set(1, 21, 10), set(2, 18, 21)], 'BEST_OF_3')
      ).toBeNull();
    });
  });

  describe('setWins', () => {
    it('counts completed-set wins per side', () => {
      const sets = [set(1, 21, 10), set(2, 18, 21), set(3, 5, 3)];
      expect(setWins(sets)).toEqual({ side1: 1, side2: 1 });
    });
  });

  describe('applyDelta', () => {
    it('adds a point to the current set', () => {
      const result = applyDelta([set(1, 5, 5)], 1, 1, 'BEST_OF_1', false);
      expect(result[0]).toMatchObject({ player1Score: 6, player2Score: 5 });
    });
    it('clamps at 0 on negative delta', () => {
      const result = applyDelta([set(1, 0, 3)], 1, -1, 'BEST_OF_1', false);
      expect(result[0].player1Score).toBe(0);
    });
    it('opens a new set when current set completes (best of 3)', () => {
      const result = applyDelta([set(1, 20, 19)], 1, 1, 'BEST_OF_3', false);
      // 21-19 completes set 1, match not over -> a new in-progress set opens
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        setNumber: 2,
        player1Score: 0,
        player2Score: 0,
      });
    });
    it('does NOT open a new set when that point wins the match (best of 1)', () => {
      const result = applyDelta([set(1, 20, 19)], 1, 1, 'BEST_OF_1', false);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ player1Score: 21, player2Score: 19 });
    });
    it('throws when scoring an already-decided match', () => {
      const decided = [set(1, 21, 10)];
      expect(() => applyDelta(decided, 2, 1, 'BEST_OF_1', false)).toThrow(
        MatchAlreadyDecidedError
      );
    });
    it('mirrors side scores into player3/4 for doubles', () => {
      const result = applyDelta([], 1, 1, 'BEST_OF_1', true);
      expect(result[0]).toMatchObject({
        player1Score: 1,
        player2Score: 0,
        player3Score: 1,
        player4Score: 0,
      });
    });
  });

  describe('rebuildFromLog (undo support)', () => {
    it('reconstructs the same scores by replaying the log', () => {
      // Interleave to 19-19, then side1 takes the last two points -> 21-19.
      const log: { side: 1 | 2; setNumber: number }[] = [];
      for (let i = 0; i < 19; i++) {
        log.push({ side: 1, setNumber: 1 });
        log.push({ side: 2, setNumber: 1 });
      }
      log.push({ side: 1, setNumber: 1 });
      log.push({ side: 1, setNumber: 1 });
      const rebuilt = rebuildFromLog(log, 'BEST_OF_1', false);
      expect(rebuilt[0]).toMatchObject({ player1Score: 21, player2Score: 19 });
    });
  });

  describe('buildScoreString', () => {
    it('formats sets as a comma-joined string', () => {
      const sets = [set(1, 21, 19), set(2, 18, 21), set(3, 21, 15)];
      expect(buildScoreString(sets)).toBe('21-19, 18-21, 21-15');
    });
  });

  describe('totalsFromSets', () => {
    it('sums across sets for singles', () => {
      const sets = [set(1, 21, 19), set(2, 15, 21)];
      expect(totalsFromSets(sets, false)).toEqual({
        player1Score: 36,
        player2Score: 40,
      });
    });
    it('mirrors totals for doubles', () => {
      const sets = [set(1, 21, 19)];
      expect(totalsFromSets(sets, true)).toEqual({
        player1Score: 21,
        player2Score: 19,
        player3Score: 21,
        player4Score: 19,
      });
    });
  });
});
