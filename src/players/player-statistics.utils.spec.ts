import { calculatePlayerPointDifferentials } from './player-statistics.utils';

const player = (playerId: string, position: number) => ({ playerId, position });

const match = (
  score: unknown,
  options: {
    status?: string;
    isDraw?: boolean;
    players?: Array<{ playerId: string; position: number }>;
    direction?: string;
  } = {}
) => ({
  status: options.status ?? 'FINISHED',
  score: score == null ? null : JSON.stringify(score),
  isDraw: options.isDraw ?? false,
  players: options.players ?? [player('a', 0), player('b', 1)],
  court: { direction: options.direction ?? 'HORIZONTAL' },
});

describe('calculatePlayerPointDifferentials', () => {
  it('calculates singles differentials from player score entries', () => {
    const result = calculatePlayerPointDifferentials([
      match([
        { playerId: 'a', score: 21 },
        { playerId: 'b', score: 17 },
      ]),
    ]);

    expect(result.get('a')).toEqual({
      scoredMatches: 1,
      averagePointDifferential: 4,
    });
    expect(result.get('b')?.averagePointDifferential).toBe(-4);
  });

  it('counts a doubles team score once for each player', () => {
    const players = [
      player('a', 0),
      player('b', 1),
      player('c', 2),
      player('d', 3),
    ];
    const result = calculatePlayerPointDifferentials([
      match(
        players.map(({ playerId }, index) => ({
          playerId,
          score: index < 2 ? 21 : 19,
        })),
        { players }
      ),
    ]);

    expect(result.get('a')?.averagePointDifferential).toBe(2);
    expect(result.get('b')?.averagePointDifferential).toBe(2);
    expect(result.get('c')?.averagePointDifferential).toBe(-2);
    expect(result.get('d')?.averagePointDifferential).toBe(-2);
  });

  it('maps legacy pair scores using vertical court positions', () => {
    const players = [
      player('a', 0),
      player('b', 1),
      player('c', 2),
      player('d', 3),
    ];
    const result = calculatePlayerPointDifferentials([
      match({ pair1: 21, pair2: 15 }, { players, direction: 'VERTICAL' }),
    ]);

    expect(result.get('a')?.averagePointDifferential).toBe(6);
    expect(result.get('c')?.averagePointDifferential).toBe(6);
    expect(result.get('b')?.averagePointDifferential).toBe(-6);
    expect(result.get('d')?.averagePointDifferential).toBe(-6);
  });

  it('supports score tuples and nested legacy objects', () => {
    const tupleResult = calculatePlayerPointDifferentials([match([21, 18])]);
    const objectResult = calculatePlayerPointDifferentials([
      match({ scores: { team1: 19, team2: 21 } }),
    ]);

    expect(tupleResult.get('a')?.averagePointDifferential).toBe(3);
    expect(objectResult.get('a')?.averagePointDifferential).toBe(-2);
  });

  it('includes valid draws as zero differential', () => {
    const result = calculatePlayerPointDifferentials([
      match({ pair1: 21, pair2: 21 }, { isDraw: true }),
    ]);

    expect(result.get('a')).toEqual({
      scoredMatches: 1,
      averagePointDifferential: 0,
    });
  });

  it('ignores unfinished, missing, partial, zero-zero and invalid scores', () => {
    const result = calculatePlayerPointDifferentials([
      match({ pair1: 21 }),
      match({ pair1: 21, pair2: ' ' }),
      match({ pair1: 0, pair2: 0 }),
      match({ pair1: 'invalid', pair2: 10 }),
      match({ pair1: 21, pair2: 19 }, { status: 'IN_PROGRESS' }),
      match(null),
      match(
        [
          { playerId: 'a', score: 21 },
          { playerId: 'b', score: 19 },
          { playerId: 'c', score: 19 },
        ],
        {
          players: [
            player('a', 0),
            player('b', 1),
            player('c', 2),
            player('d', 3),
          ],
        }
      ),
    ]);

    expect(result.size).toBe(0);
  });

  it('ignores a draw whose recorded scores are inconsistent', () => {
    const result = calculatePlayerPointDifferentials([
      match({ pair1: 21, pair2: 19 }, { isDraw: true }),
    ]);

    expect(result.size).toBe(0);
  });

  it('averages multiple matches and rounds to one decimal place', () => {
    const result = calculatePlayerPointDifferentials([
      match({ pair1: 21, pair2: 18 }),
      match({ pair1: 15, pair2: 21 }),
      match({ pair1: 21, pair2: 20 }),
    ]);

    expect(result.get('a')).toEqual({
      scoredMatches: 3,
      averagePointDifferential: -0.7,
    });
    expect(result.get('b')?.averagePointDifferential).toBe(0.7);
  });
});
