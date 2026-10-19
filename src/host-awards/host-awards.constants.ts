/**
 * Monthly host awards ("Host Tiêu Biểu Tháng"). Every threshold lives here so
 * the rules can be tuned in one place; bump HOST_AWARDS_RULES_VERSION whenever
 * a change would alter results, so stored periods say which rules scored them.
 *
 * The fraud thresholds are internal — only the principles are published.
 */
export const HOST_AWARDS_RULES_VERSION = 2;

/** Backend-only flag; when off, public endpoints return nothing. */
export const HOST_AWARDS_FEATURE_FLAG = 'HOST_AWARDS';

/** What makes a session and a player count for the host. */
export const QUALIFICATION = {
  minSessionMinutes: 60,
  /** Account players plus named guests who played in a real match. */
  minCountedPlayers: 4,
  /**
   * One recorded match proves the host ran the session in the app. 90 of 167
   * sessions in the first measured month had none, so asking for more would
   * rule out most hosts before anything else is looked at.
   */
  minFinishedMatches: 1,
  minMatchMinutes: 5,
  maxSessionsPerDay: 2,
  maxSessionsPerMonth: 30,
  internalSessionWeight: 0.5,
  minPlayerAccountAgeDays: 3,
} as const;

/** Gate a host must pass to be ranked at all. */
export const ELIGIBILITY = {
  minHostAccountAgeDays: 30,
  minQualifiedSessions: 3,
  minDistinctPlayers: 8,
  maxCancelRate: 0.3,
} as const;

/**
 * Most players on Vmito still join as guests (84% of slots in the first
 * measured month), so guests count, but less than someone with an account:
 * an account is what brings a player onto the platform, and a guest name is
 * cheap for a host to invent.
 */
export const PLAYER_WEIGHTS = {
  account: 1,
  guest: 0.5,
} as const;

export const SCORE_WEIGHTS = {
  reach: 0.3,
  activity: 0.2,
  retention: 0.15,
  growth: 0.15,
  quality: 0.2,
} as const;

export type ScoreComponent = keyof typeof SCORE_WEIGHTS;

export const RATING = {
  /** Bayesian prior weight: how many "average" ratings every host starts with. */
  priorWeight: 10,
  /** Ratings sent later than this after the session do not count. */
  windowDays: 7,
  /** Prior mean used when the month has no countable ratings at all. */
  fallbackMean: 4.5,
} as const;

export const FRAUD = {
  closedClusterRatio: 0.7,
  closedClusterPenalty: 0.2,
  newAccountDays: 30,
  newAccountRatio: 0.6,
  newAccountPenalty: 0.15,
  ratingNewAccountFiveStarRatio: 0.9,
  ratingZeroVarianceMinCount: 10,
  reciprocalFiveStarMinCount: 3,
  ghostMatchMedianMinutes: 8,
  ghostMatchNoResultRatio: 0.5,
  blockedByPlayersMin: 3,
  minTrustFactor: 0.5,
  /** Ratio flags need this many accounts to mean anything. */
  minAccountsForRatioFlags: 5,
} as const;

export const CATEGORY_RULES = {
  overallTopN: 10,
  newcomerMinGrowth: 5,
  lovedMinRatings: 15,
  reliableMinSessions: 12,
  risingStarMaxHostAgeDays: 90,
} as const;

/** Day of the following month (VN time) on which a month is finalized. */
export const FINALIZE_DAY_OF_MONTH = 8;

/** Size of the public live board while the month is running. */
export const PROVISIONAL_TOP_N = 20;

/** Admins review this many top hosts, plus every flagged host. */
export const REVIEW_TOP_N = 20;

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
