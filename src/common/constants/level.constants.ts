export const LEVELS = {
  BEGINNER_MINUS: 9,
  BEGINNER: 1,
  BEGINNER_PLUS: 10,
  ADVANCED_BEGINNER: 2,
  LOW_INTERMEDIATE: 3,
  INTERMEDIATE: 4,
  HIGH_INTERMEDIATE: 5,
  ADVANCED: 6,
  SEMI_PRO: 7,
  PRO: 8,
} as const;

export const LEVEL_DEFINITIONS = [
  {
    id: LEVELS.BEGINNER_MINUS,
    code: 'Y_MINUS',
    shortLabel: 'Yếu-',
    sortOrder: 5,
  },
  { id: LEVELS.BEGINNER, code: 'Y', shortLabel: 'Yếu', sortOrder: 10 },
  {
    id: LEVELS.BEGINNER_PLUS,
    code: 'Y_PLUS',
    shortLabel: 'Yếu+',
    sortOrder: 15,
  },
  {
    id: LEVELS.ADVANCED_BEGINNER,
    code: 'TBY',
    shortLabel: 'TBY',
    sortOrder: 20,
  },
  {
    id: LEVELS.LOW_INTERMEDIATE,
    code: 'TB_MINUS',
    shortLabel: 'TB-',
    sortOrder: 30,
  },
  { id: LEVELS.INTERMEDIATE, code: 'TB', shortLabel: 'TB', sortOrder: 40 },
  {
    id: LEVELS.HIGH_INTERMEDIATE,
    code: 'TB_PLUS',
    shortLabel: 'TB+',
    sortOrder: 50,
  },
  { id: LEVELS.ADVANCED, code: 'KHA', shortLabel: 'Khá', sortOrder: 60 },
  { id: LEVELS.SEMI_PRO, code: 'BC', shortLabel: 'BC', sortOrder: 70 },
  { id: LEVELS.PRO, code: 'CN', shortLabel: 'CN', sortOrder: 80 },
] as const;

export const VALID_LEVELS: number[] = LEVEL_DEFINITIONS.map(
  (level) => level.id
);

export const LEVEL_RANK_BY_ID: Map<number, number> = new Map(
  LEVEL_DEFINITIONS.map((level, index) => [level.id, index])
);

export const LEVEL_SHORT_LABELS = Object.fromEntries(
  LEVEL_DEFINITIONS.map((level) => [level.id, level.shortLabel])
) as Record<number, string>;

export const isValidLevel = (level: number): boolean =>
  LEVEL_RANK_BY_ID.has(level);

export const getLevelRank = (level: number): number | undefined =>
  LEVEL_RANK_BY_ID.get(level);

export const getLevelDistance = (
  firstLevel: number,
  secondLevel: number
): number => {
  const firstRank = getLevelRank(firstLevel);
  const secondRank = getLevelRank(secondLevel);
  if (firstRank === undefined || secondRank === undefined) return Infinity;
  return Math.abs(firstRank - secondRank);
};

export const getLevelsInRange = (
  firstLevel: number,
  secondLevel: number
): number[] => {
  const firstRank = getLevelRank(firstLevel);
  const secondRank = getLevelRank(secondLevel);
  if (firstRank === undefined || secondRank === undefined) return [];

  const start = Math.min(firstRank, secondRank);
  const end = Math.max(firstRank, secondRank);
  return LEVEL_DEFINITIONS.slice(start, end + 1).map((level) => level.id);
};

export const sortLevelsByRank = (levels: number[]): number[] =>
  [...levels].sort((a, b) => {
    const rankA = getLevelRank(a) ?? Number.MAX_SAFE_INTEGER;
    const rankB = getLevelRank(b) ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

export type LevelType = (typeof LEVELS)[keyof typeof LEVELS];
