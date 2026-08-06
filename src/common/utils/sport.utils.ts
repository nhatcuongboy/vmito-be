import { SportType } from '@prisma/client';

/**
 * Central sport registry. Every map is an exhaustive `Record<SportType, ...>`
 * so adding a value to the enum breaks the build at each place that needs an update.
 */

/** Normalized (tone-less, lowercase) keywords folded into searchTerms per sport. */
export const SPORT_SEARCH_TOKENS: Record<SportType, string> = {
  [SportType.BADMINTON]: 'cau long badminton',
  [SportType.PICKLEBALL]: 'pickleball',
};

/** Keywords used to detect the sport from free text (Facebook posts, AI output). */
export const SPORT_DETECTION_KEYWORDS: Record<SportType, string[]> = {
  [SportType.BADMINTON]: ['cau long', 'badminton', 'cầu lông'],
  [SportType.PICKLEBALL]: ['pickleball', 'pickle ball', 'pikleball', 'pickle'],
};

export const DEFAULT_SPORT_TYPE: SportType = SportType.BADMINTON;

export const isSportType = (value: unknown): value is SportType =>
  typeof value === 'string' &&
  (Object.values(SportType) as string[]).includes(value);

export const normalizeSportType = (
  value: unknown,
  fallback: SportType = DEFAULT_SPORT_TYPE
): SportType => (isSportType(value) ? value : fallback);

/** Supported sports of a venue, tolerating rows created before `sportTypes` existed. */
export const resolveVenueSportTypes = (venue: {
  sportType?: SportType | null;
  sportTypes?: SportType[] | null;
}): SportType[] => {
  const supported = (venue.sportTypes ?? []).filter(isSportType);
  return supported.length > 0
    ? supported
    : [normalizeSportType(venue.sportType)];
};

export const venueSupportsSport = (
  venue: { sportType?: SportType | null; sportTypes?: SportType[] | null },
  sport: SportType
): boolean => resolveVenueSportTypes(venue).includes(sport);
