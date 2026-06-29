import {
  computeStandings,
  resolveStandingsConfig,
  StandingsConfig,
  StandingsMatchInput,
} from './standings';

const baseConfig = (over: Partial<StandingsConfig> = {}): StandingsConfig => ({
  pointsEarning: 'match_results',
  winPoints: 2,
  tiePoints: 1,
  lossPoints: 0,
  cancelledMatchPoints: 0,
  gameWinPoints: 0,
  gameLossPoints: 0,
  forfeitWinPoints: 0,
  forfeitLossPoints: 0,
  tiebreakers: [{ id: 'total_points' }, { id: 'head_to_head' }],
  headToHeadTiebreakers: [],
  ...over,
});

/** A finished single-set match: position-1 reg vs position-2 reg. */
const match = (
  p1: string,
  p2: string,
  s1: number,
  s2: number,
  over: Partial<StandingsMatchInput> = {}
): StandingsMatchInput => ({
  participants: [
    { categoryRegistrationId: p1, position: 1 },
    { categoryRegistrationId: p2, position: 2 },
  ],
  player1Score: s1,
  player2Score: s2,
  sets: [{ player1Score: s1, player2Score: s2 }],
  winnerId: s1 > s2 ? p1 : s2 > s1 ? p2 : null,
  isDraw: false,
  isForfeit: false,
  isCancelled: false,
  ...over,
});

const entrants = (...ids: string[]) =>
  ids.map((id) => ({ categoryRegistrationId: id }));

const rankOf = (rows: ReturnType<typeof computeStandings>, id: string) =>
  rows.find((r) => r.categoryRegistrationId === id)!;

describe('resolveStandingsConfig', () => {
  it('applies sensible defaults when config is null', () => {
    const c = resolveStandingsConfig(null);
    expect(c.pointsEarning).toBe('match_results');
    expect(c.winPoints).toBe(2);
    expect(c.tiePoints).toBe(0);
    expect(c.lossPoints).toBe(1);
    expect(c.tiebreakers).toHaveLength(4);
  });

  it('zeroes every point weight in tiebreakers_only mode', () => {
    const c = resolveStandingsConfig({
      pointsEarning: 'tiebreakers_only',
      winPoints: 3,
      gameWinPoints: 2,
      forfeitWinPoints: 5,
    });
    expect(c.pointsEarning).toBe('tiebreakers_only');
    expect(c.winPoints).toBe(0);
    expect(c.gameWinPoints).toBe(0);
    expect(c.forfeitWinPoints).toBe(0);
  });

  it('reads from a nested roundRobin (RR→SE) config', () => {
    const c = resolveStandingsConfig({
      roundRobin: { winPoints: 5, tiePoints: 2 },
    });
    expect(c.winPoints).toBe(5);
    expect(c.tiePoints).toBe(2);
  });
});

describe('computeStandings — points', () => {
  it('awards win/tie/loss points', () => {
    const rows = computeStandings(
      entrants('A', 'B'),
      [match('A', 'B', 21, 15)],
      baseConfig()
    );
    expect(rankOf(rows, 'A').points).toBe(2);
    expect(rankOf(rows, 'A').matchesWon).toBe(1);
    expect(rankOf(rows, 'B').points).toBe(0);
    expect(rankOf(rows, 'B').matchesLost).toBe(1);
  });

  it('splits tie points on a draw', () => {
    const rows = computeStandings(
      entrants('A', 'B'),
      [match('A', 'B', 21, 21, { winnerId: null, isDraw: true })],
      baseConfig()
    );
    expect(rankOf(rows, 'A').points).toBe(1);
    expect(rankOf(rows, 'B').points).toBe(1);
    expect(rankOf(rows, 'A').matchesDrawn).toBe(1);
  });

  // Regression: game points used to be multiplied by the *cumulative* games
  // total, so a team's game points ballooned across matches (2 + 4 = 6).
  it('counts game points per match, not cumulatively', () => {
    const bestOf3 = (p1: string, p2: string): StandingsMatchInput => ({
      ...match(p1, p2, 42, 22),
      sets: [
        { player1Score: 21, player2Score: 10 },
        { player1Score: 21, player2Score: 12 },
      ],
    });
    const rows = computeStandings(
      entrants('A', 'B', 'C'),
      [bestOf3('A', 'B'), bestOf3('A', 'C')],
      baseConfig({ winPoints: 0, gameWinPoints: 1 })
    );
    // A won 2 games in each of 2 matches = 4 game points (not 2 + 4 = 6).
    expect(rankOf(rows, 'A').gamesWon).toBe(4);
    expect(rankOf(rows, 'A').points).toBe(4);
  });
});

describe('computeStandings — forfeit', () => {
  it('uses forfeit point weights and tracks the forfeit count', () => {
    const rows = computeStandings(
      entrants('A', 'B'),
      [
        match('A', 'B', 0, 0, {
          winnerId: 'A',
          isForfeit: true,
          sets: null,
        }),
      ],
      baseConfig({ winPoints: 2, forfeitWinPoints: 1, forfeitLossPoints: -1 })
    );
    expect(rankOf(rows, 'A').points).toBe(1); // forfeitWinPoints, not winPoints
    expect(rankOf(rows, 'A').matchesWon).toBe(1);
    expect(rankOf(rows, 'B').points).toBe(-1);
    expect(rankOf(rows, 'B').matchesLost).toBe(1);
    expect(rankOf(rows, 'B').matchesForfeited).toBe(1);
    expect(rankOf(rows, 'A').matchesForfeited).toBe(0);
  });
});

describe('computeStandings — manual points', () => {
  it('takes points straight from per-match manual values', () => {
    const rows = computeStandings(
      entrants('A', 'B'),
      [
        match('A', 'B', 21, 18, {
          player1Points: 5,
          player2Points: 3,
        }),
      ],
      baseConfig({ pointsEarning: 'manual', winPoints: 2, gameWinPoints: 10 })
    );
    expect(rankOf(rows, 'A').points).toBe(5); // ignores winPoints & gameWinPoints
    expect(rankOf(rows, 'B').points).toBe(3);
    expect(rankOf(rows, 'A').matchesWon).toBe(1); // W/L still tracked
    expect(rankOf(rows, 'B').matchesLost).toBe(1);
  });
});

describe('computeStandings — cancelled matches', () => {
  it('awards cancelledMatchPoints without counting as played', () => {
    const rows = computeStandings(
      entrants('A', 'B'),
      [
        match('A', 'B', 0, 0, {
          winnerId: null,
          isCancelled: true,
          sets: null,
        }),
      ],
      baseConfig({ cancelledMatchPoints: 1 })
    );
    expect(rankOf(rows, 'A').points).toBe(1);
    expect(rankOf(rows, 'B').points).toBe(1);
    expect(rankOf(rows, 'A').matchesCancelled).toBe(1);
    expect(rankOf(rows, 'A').matchesPlayed).toBe(0);
    expect(rankOf(rows, 'A').matchesWon).toBe(0);
  });
});

describe('computeStandings — advanced tiebreakers', () => {
  it('breaks a tie by average point differential', () => {
    // A, B, D tie on 2 points; average point differential orders them A>D>B.
    const rows = computeStandings(
      entrants('A', 'B', 'C', 'D', 'E'),
      [
        match('A', 'E', 21, 11), // A: +10 over 1 match → avg 10
        match('B', 'C', 21, 16), // B: +5
        match('D', 'B', 21, 16), // D: +5 (1 match → avg 5); B now -5 → avg 0
      ],
      baseConfig({
        tiebreakers: [
          { id: 'total_points' },
          { id: 'average_point_differential' },
        ],
      })
    );
    expect(rankOf(rows, 'A').rank).toBe(1);
    expect(rankOf(rows, 'D').rank).toBe(2);
    expect(rankOf(rows, 'B').rank).toBe(3);
  });

  it('handles an unbeaten (Infinity) game ratio without breaking the sort', () => {
    const winBestOf3 = (
      p1: string,
      p2: string,
      sets: Array<[number, number]>
    ): StandingsMatchInput => ({
      ...match(
        p1,
        p2,
        sets.reduce((s, [a]) => s + a, 0),
        sets.reduce((s, [, b]) => s + b, 0)
      ),
      sets: sets.map(([a, b]) => ({ player1Score: a, player2Score: b })),
    });
    const rows = computeStandings(
      entrants('A', 'B', 'C', 'D'),
      [
        // A: 2-0 → ratio Infinity. B: 2-1 → ratio 2. Both 1 win = 2 points.
        winBestOf3('A', 'C', [
          [21, 10],
          [21, 12],
        ]),
        winBestOf3('B', 'D', [
          [21, 10],
          [15, 21],
          [21, 18],
        ]),
      ],
      baseConfig({
        tiebreakers: [{ id: 'total_points' }, { id: 'highest_game_ratio' }],
      })
    );
    expect(rankOf(rows, 'A').rank).toBe(1);
    expect(rankOf(rows, 'B').rank).toBe(2);
  });
});

describe('computeStandings — tiebreakers', () => {
  // A, B, D all finish on 2 points; head-to-head among only those three
  // (D beat B, B beat A, A–D never met) must order them D > B > A.
  it('resolves a 3-way tie with a head-to-head mini-table', () => {
    const rows = computeStandings(
      entrants('A', 'B', 'C', 'D'),
      [
        match('A', 'C', 21, 10),
        match('B', 'A', 21, 15),
        match('D', 'B', 21, 12),
      ],
      baseConfig()
    );
    expect(rankOf(rows, 'D').rank).toBe(1);
    expect(rankOf(rows, 'B').rank).toBe(2);
    expect(rankOf(rows, 'A').rank).toBe(3);
    expect(rankOf(rows, 'C').rank).toBe(4);
  });

  it('falls back to the deterministic seed order on a circular tie', () => {
    // A>B>C>A: equal points, head-to-head nets to 0 for everyone.
    const rows = computeStandings(
      entrants('A', 'B', 'C'),
      [
        match('A', 'B', 21, 10),
        match('B', 'C', 21, 10),
        match('C', 'A', 21, 10),
      ],
      baseConfig()
    );
    expect(rows.map((r) => r.categoryRegistrationId)).toEqual(['A', 'B', 'C']);
  });

  it('is fully deterministic when everything ties', () => {
    const rows = computeStandings(entrants('X', 'Y'), [], baseConfig());
    expect(rows.map((r) => r.categoryRegistrationId)).toEqual(['X', 'Y']);
  });

  it('applies head-to-head sub-tiebreakers after a circular head-to-head', () => {
    // Circular wins, but D... here use point differential within the tied set.
    // A>B (21-1), B>C (21-1), C>A (21-20): head-to-head net ties at 0, but the
    // head-to-head point differential separates them.
    const rows = computeStandings(
      entrants('A', 'B', 'C'),
      [match('A', 'B', 21, 1), match('B', 'C', 21, 1), match('C', 'A', 21, 20)],
      baseConfig({
        headToHeadTiebreakers: [{ id: 'point_differential' }],
      })
    );
    // Intra point diff: A = (+20) + (-1) = +19; B = (-20) + (+20) = 0;
    // C = (-20) + (+1) = -19  → order A, B, C.
    expect(rows.map((r) => r.categoryRegistrationId)).toEqual(['A', 'B', 'C']);
  });
});
