import { getLevelRank } from '../../common/constants/level.constants';
import {
  Recommendation,
  RecommendationReason,
  UserRecommendationContext,
} from '../recommendation.types';
import {
  ScoreBuilder,
  distanceScore,
  normalizeArea,
  weeklySlotsScore,
} from '../recommendation.utils';

/** A class is a weekly commitment, so it has to be close. */
const RADIUS_KM = 10;

export interface ScorableClass {
  requiredLevels: number[];
  tuitionAmount: number | null;
  tuitionPeriod: string;
  venueId: string | null;
  customLocationLat: number | null;
  customLocationLng: number | null;
  customLocationDistrict: string | null;
  venue: {
    lat: number | null;
    lng: number | null;
    district: string | null;
    newDistrict: string | null;
  } | null;
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export interface ClassSignals {
  /** Median tuition of the candidates with the same tuition period. */
  medianTuition: number | null;
}

/**
 * Weights (sum 1): level .30, schedule .25, distance .25, tuition .10,
 * familiar venue .10.
 */
export function scoreClass(
  item: ScorableClass,
  ctx: UserRecommendationContext,
  signals: ClassSignals
): Recommendation {
  const builder = new ScoreBuilder();

  const level = classLevelFit(ctx.level, item.requiredLevels);
  builder.add(0.3, level.score, level.reason);

  builder.add(0.25, weeklySlotsScore(ctx, item.schedules), {
    code: 'USUAL_SCHEDULE',
  });

  const distance = distanceScore(
    ctx,
    item.venue?.lat ?? item.customLocationLat,
    item.venue?.lng ?? item.customLocationLng,
    RADIUS_KM
  );
  builder.add(
    0.25,
    distance.score,
    distance.km != null
      ? { code: 'NEAR', value: Math.round(distance.km * 10) / 10 }
      : undefined,
    0.6
  );

  builder.add(0.1, tuitionScore(item.tuitionAmount, signals.medianTuition));

  let venue = item.venueId ? (ctx.venueAffinity.get(item.venueId) ?? 0) : 0;
  const district = normalizeArea(
    item.venue?.newDistrict ??
      item.venue?.district ??
      item.customLocationDistrict
  );
  if (venue === 0 && district && ctx.usualDistricts.has(district)) {
    venue = 0.4;
  }
  builder.add(0.1, venue, { code: 'FAMILIAR_VENUE' }, 0.5);

  return builder.build();
}

/**
 * People take a class to improve, so a class one rank above the viewer fits
 * as well as one at their level; classes below it fit poorly.
 */
function classLevelFit(
  viewerLevel: number | null,
  classLevels: number[]
): { score: number; reason?: RecommendationReason } {
  if (classLevels.length === 0) return { score: 0.6 };
  const viewerRank =
    viewerLevel == null ? undefined : getLevelRank(viewerLevel);
  if (viewerRank === undefined) return { score: 0.5 };
  const ranks = classLevels
    .map((level) => getLevelRank(level))
    .filter((rank): rank is number => rank !== undefined);
  if (ranks.includes(viewerRank)) {
    return { score: 1, reason: { code: 'LEVEL_MATCH' } };
  }
  if (ranks.includes(viewerRank + 1)) {
    return { score: 1, reason: { code: 'LEVEL_UP' } };
  }
  if (ranks.some((rank) => Math.abs(rank - viewerRank) <= 2)) {
    return { score: 0.4 };
  }
  return { score: 0 };
}

/**
 * 1 up to 30% above the typical price for the same period, falling to 0 at
 * double it. Cheaper is never penalized. Neutral when unknown.
 */
function tuitionScore(amount: number | null, median: number | null): number {
  if (amount == null || median == null || median <= 0) return 0.5;
  const over = (amount - median) / median;
  return over <= 0.3 ? 1 : Math.max(0, 1 - (over - 0.3) / 0.7);
}
