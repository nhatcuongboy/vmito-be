type MatchPlayerPosition = {
  playerId: string;
  position: number;
};

type PointDifferentialMatch = {
  status: string;
  score: string | null;
  isDraw: boolean | null;
  players: MatchPlayerPosition[];
  court?: { direction: string } | null;
};

export type PlayerPointDifferential = {
  scoredMatches: number;
  averagePointDifferential: number;
};

type SideScores = { side1: number; side2: number };
type MatchSides = readonly [
  readonly MatchPlayerPosition[],
  readonly MatchPlayerPosition[],
];

const toValidScore = (value: unknown): number | null => {
  if (
    value == null ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  const score = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(score) && score >= 0 ? score : null;
};

const getMatchSides = (match: PointDifferentialMatch): MatchSides | null => {
  const sortedPlayers = [...match.players].sort(
    (first, second) => first.position - second.position
  );

  if (sortedPlayers.length === 2) {
    return [[sortedPlayers[0]], [sortedPlayers[1]]] as const;
  }
  if (sortedPlayers.length !== 4) return null;

  if (match.court?.direction === 'VERTICAL') {
    return [
      sortedPlayers.filter((player) => player.position % 2 === 0),
      sortedPlayers.filter((player) => player.position % 2 !== 0),
    ] as const;
  }

  return [sortedPlayers.slice(0, 2), sortedPlayers.slice(2, 4)] as const;
};

const readObjectSideScores = (
  value: Record<string, unknown>
): SideScores | null => {
  const scores =
    value.scores && typeof value.scores === 'object'
      ? (value.scores as Record<string, unknown>)
      : value;
  const side1 = toValidScore(scores.pair1 ?? scores.team1 ?? scores.score1);
  const side2 = toValidScore(scores.pair2 ?? scores.team2 ?? scores.score2);

  if (side1 == null || side2 == null || (side1 === 0 && side2 === 0)) {
    return null;
  }
  return { side1, side2 };
};

const readSideScores = (
  rawScore: string,
  sides: ReturnType<typeof getMatchSides>
): SideScores | null => {
  if (!sides) return null;

  let score: unknown;
  try {
    score = JSON.parse(rawScore);
  } catch {
    return null;
  }

  if (Array.isArray(score)) {
    if (
      score.length === 2 &&
      score.every((value) => typeof value !== 'object')
    ) {
      const side1 = toValidScore(score[0]);
      const side2 = toValidScore(score[1]);
      if (side1 == null || side2 == null || (side1 === 0 && side2 === 0)) {
        return null;
      }
      return { side1, side2 };
    }

    const scoreByPlayer = new Map<string, number>();
    for (const entry of score) {
      if (!entry || typeof entry !== 'object') return null;
      const playerId = (entry as Record<string, unknown>).playerId;
      const playerScore = toValidScore(
        (entry as Record<string, unknown>).score
      );
      if (typeof playerId !== 'string' || playerScore == null) return null;
      scoreByPlayer.set(playerId, playerScore);
    }

    const readTeamScore = (players: readonly MatchPlayerPosition[]) => {
      const teamScores = players.map((player) =>
        scoreByPlayer.get(player.playerId)
      );
      if (teamScores.some((value) => value == null)) return null;
      const firstScore = teamScores[0];
      if (
        firstScore == null ||
        teamScores.some((value) => value !== firstScore)
      ) {
        return null;
      }
      return firstScore;
    };

    const side1 = readTeamScore(sides[0]);
    const side2 = readTeamScore(sides[1]);
    if (side1 == null || side2 == null || (side1 === 0 && side2 === 0)) {
      return null;
    }
    return { side1, side2 };
  }

  if (score && typeof score === 'object') {
    return readObjectSideScores(score as Record<string, unknown>);
  }
  return null;
};

export const calculatePlayerPointDifferentials = (
  matches: PointDifferentialMatch[]
): Map<string, PlayerPointDifferential> => {
  const totals = new Map<
    string,
    { scoredMatches: number; totalPointDifferential: number }
  >();

  for (const match of matches) {
    if (match.status !== 'FINISHED' || !match.score) continue;

    const sides = getMatchSides(match);
    const scores = readSideScores(match.score, sides);
    if (!sides || !scores) continue;
    if (match.isDraw && scores.side1 !== scores.side2) continue;

    const addSideDifferential = (
      side: readonly MatchPlayerPosition[],
      pointDifferential: number
    ) => {
      side.forEach(({ playerId }) => {
        const current = totals.get(playerId) ?? {
          scoredMatches: 0,
          totalPointDifferential: 0,
        };
        current.scoredMatches += 1;
        current.totalPointDifferential += pointDifferential;
        totals.set(playerId, current);
      });
    };

    addSideDifferential(sides[0], scores.side1 - scores.side2);
    addSideDifferential(sides[1], scores.side2 - scores.side1);
  }

  return new Map(
    [...totals.entries()].map(([playerId, total]) => {
      const roundedAverage =
        Math.round((total.totalPointDifferential / total.scoredMatches) * 10) /
        10;
      return [
        playerId,
        {
          scoredMatches: total.scoredMatches,
          averagePointDifferential: Object.is(roundedAverage, -0)
            ? 0
            : roundedAverage,
        },
      ];
    })
  );
};
