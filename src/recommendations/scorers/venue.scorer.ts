import {
  Recommendation,
  UserRecommendationContext,
} from '../recommendation.types';
import {
  ScoreBuilder,
  distanceScore,
  normalizeArea,
} from '../recommendation.utils';

/** People pick a court near home or work; beyond this it scores 0. */
const RADIUS_KM = 10;
const OPEN_SESSIONS_FOR_FULL_SCORE = 3;

export interface ScorableVenue {
  id: string;
  lat: number | null;
  lng: number | null;
  district: string | null;
  newDistrict: string | null;
  isVerified: boolean;
}

export interface VenueSignals {
  /** Joinable sessions at the venue in the next 7 days that fit the level. */
  openSessions: number;
  /** 0..1, views and recent sessions relative to the other candidates. */
  popularity: number;
}

/**
 * Weights (sum 1): distance .35, familiar .20, open sessions .20,
 * usual district .10, popularity .10, verified .05.
 */
export function scoreVenue(
  venue: ScorableVenue,
  ctx: UserRecommendationContext,
  signals: VenueSignals
): Recommendation {
  const builder = new ScoreBuilder();

  const distance = distanceScore(ctx, venue.lat, venue.lng, RADIUS_KM);
  builder.add(
    0.35,
    distance.score,
    distance.km != null
      ? { code: 'NEAR', value: Math.round(distance.km * 10) / 10 }
      : undefined,
    0.6
  );

  builder.add(
    0.2,
    ctx.venueAffinity.get(venue.id) ?? 0,
    { code: 'FAMILIAR_VENUE' },
    0.5
  );

  builder.add(
    0.2,
    signals.openSessions / OPEN_SESSIONS_FOR_FULL_SCORE,
    signals.openSessions > 0
      ? { code: 'HAS_OPEN_SESSIONS', value: signals.openSessions }
      : undefined,
    1 / OPEN_SESSIONS_FOR_FULL_SCORE
  );

  const district = normalizeArea(venue.newDistrict ?? venue.district);
  builder.add(0.1, district && ctx.usualDistricts.has(district) ? 1 : 0);

  builder.add(0.1, signals.popularity, { code: 'POPULAR' }, 0.8);

  // Lowest weight: it breaks ties, it is rarely why a venue fits someone.
  builder.add(0.05, venue.isVerified ? 1 : 0);

  return builder.build();
}
