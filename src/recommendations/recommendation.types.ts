import { Gender, SportType } from '@prisma/client';

/**
 * Reason codes are returned instead of display text so every client
 * localizes them (the mobile app renders them through ARB).
 */
export type RecommendationReasonCode =
  | 'LEVEL_MATCH'
  | 'NEAR'
  | 'USUAL_SCHEDULE'
  | 'FAMILIAR_VENUE'
  | 'FAMILIAR_HOST'
  | 'FRIENDS_JOINED'
  | 'FEE_MATCH'
  | 'STARTING_SOON'
  | 'HAS_SLOTS'
  | 'HAS_OPEN_SESSIONS'
  | 'ACTIVE_CLUB'
  | 'FRIENDS_IN_CLUB'
  | 'VERIFIED'
  | 'POPULAR'
  | 'REG_CLOSING'
  | 'GENDER_MATCH'
  | 'LEVEL_UP';

export interface RecommendationReason {
  code: RecommendationReasonCode;
  /** Distance in km for NEAR, friend count for FRIENDS_* codes. */
  value?: number;
}

export interface Recommendation {
  /** 0..1, rounded to 2 decimals. */
  score: number;
  /** Strongest reasons first. */
  reasons: RecommendationReason[];
}

/**
 * Everything the scorers know about the viewer, computed once per request.
 * Frequency maps are normalized against their max so scorers can read
 * them as 0..1 affinities.
 */
export interface UserRecommendationContext {
  userId: string;
  level: number | null;
  gender: Gender | null;
  lat: number | null;
  lng: number | null;
  hasHistory: boolean;
  /** The only sport played, when history shows exactly one; else null. */
  soleSport: SportType | null;
  /** Weekday (0 = Sunday, Vietnam time) → 0..1 affinity. */
  dayAffinity: number[];
  /** Hour (0..23, Vietnam time) → 0..1 affinity, smoothed ±1h. */
  hourAffinity: number[];
  /** venueId → 0..1. Played-at, favorited and rented venues. */
  venueAffinity: Map<string, number>;
  /** hostId → 0..1. Played-with hosts and hosts rated ≥4★. */
  hostAffinity: Map<string, number>;
  /** Normalized district names the user usually plays in. */
  usualDistricts: Set<string>;
  /** Users the viewer shared ≥2 sessions with. */
  friendIds: Set<string>;
  /** Median per-player fee the viewer paid, in VND. */
  medianFee: number | null;
}
