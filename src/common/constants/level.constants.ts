export const LEVELS = {
  BEGINNER: 1,
  ADVANCED_BEGINNER: 2,
  LOW_INTERMEDIATE: 3,
  INTERMEDIATE: 4,
  HIGH_INTERMEDIATE: 5,
  ADVANCED: 6,
  SEMI_PRO: 7,
  PRO: 8,
} as const;

export const VALID_LEVELS = Object.values(LEVELS) as number[];

export type LevelType = typeof LEVELS[keyof typeof LEVELS];
