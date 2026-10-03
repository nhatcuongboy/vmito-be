import {
  Recommendation,
  UserRecommendationContext,
} from '../recommendation.types';
import {
  ScoreBuilder,
  distanceScore,
  feeForViewer,
  feeScore,
  levelScore,
  normalizeArea,
  toVietnamDayHour,
} from '../recommendation.utils';

/** Sessions farther than this score 0 on distance. */
const RADIUS_KM = 15;
const HOUR_MS = 60 * 60 * 1000;

export interface ScorableSession {
  hostId: string;
  venueId: string | null;
  requiredLevels: number[];
  startTime: Date | null;
  scheduledStartTime: Date | null;
  numberOfCourts: number;
  maxPlayersPerCourt: number;
  customLocationLat: number | null;
  customLocationLng: number | null;
  customLocationDistrict: string | null;
  venue: {
    lat: number | null;
    lng: number | null;
    district: string | null;
    newDistrict: string | null;
  } | null;
  feeConfig: {
    maleFee: number | null;
    femaleFee: number | null;
    splitPerPlayer: number | null;
  } | null;
  _count?: { players?: number };
}

export function availableSlots(session: ScorableSession): number {
  const max = session.numberOfCourts * session.maxPlayersPerCourt;
  return max - (session._count?.players ?? 0);
}

/**
 * Weights (sum 1): level .25, distance .15, schedule .15, venue .10,
 * host .10, fee .10, friends .05, slots .05, starting soon .05.
 */
export function scoreSession(
  session: ScorableSession,
  ctx: UserRecommendationContext,
  friendCount: number,
  now: Date = new Date()
): Recommendation {
  const builder = new ScoreBuilder();

  builder.add(0.25, levelScore(ctx, session.requiredLevels), {
    code: 'LEVEL_MATCH',
  });

  const distance = distanceScore(
    ctx,
    session.venue?.lat ?? session.customLocationLat,
    session.venue?.lng ?? session.customLocationLng,
    RADIUS_KM
  );
  builder.add(
    0.15,
    distance.score,
    distance.km != null
      ? { code: 'NEAR', value: Math.round(distance.km * 10) / 10 }
      : undefined,
    0.6
  );

  const start = session.startTime ?? session.scheduledStartTime;
  let schedule = 0.5;
  if (ctx.hasHistory && start) {
    const { day, hour } = toVietnamDayHour(start);
    schedule = 0.5 * ctx.dayAffinity[day] + 0.5 * ctx.hourAffinity[hour];
  }
  builder.add(0.15, schedule, { code: 'USUAL_SCHEDULE' });

  let venue = session.venueId
    ? (ctx.venueAffinity.get(session.venueId) ?? 0)
    : 0;
  const district = normalizeArea(
    session.venue?.newDistrict ??
      session.venue?.district ??
      session.customLocationDistrict
  );
  if (venue === 0 && district && ctx.usualDistricts.has(district)) {
    venue = 0.4;
  }
  builder.add(0.1, venue, { code: 'FAMILIAR_VENUE' }, 0.5);

  builder.add(
    0.1,
    ctx.hostAffinity.get(session.hostId) ?? 0,
    { code: 'FAMILIAR_HOST' },
    0.5
  );

  const fee = feeForViewer(ctx.gender, session.feeConfig);
  builder.add(
    0.1,
    feeScore(ctx, fee),
    ctx.medianFee != null ? { code: 'FEE_MATCH' } : undefined,
    1
  );

  builder.add(
    0.05,
    Math.min(1, friendCount / 2),
    friendCount > 0
      ? { code: 'FRIENDS_JOINED', value: friendCount }
      : undefined,
    0.5
  );

  builder.add(0.05, Math.min(1, availableSlots(session) / 4));

  if (start) {
    const hoursUntil = (start.getTime() - now.getTime()) / HOUR_MS;
    // Full score inside 48h, fading out over the following five days.
    const soon =
      hoursUntil <= 48 ? 1 : Math.max(0, 1 - (hoursUntil - 48) / 120);
    builder.add(
      0.05,
      soon,
      hoursUntil >= 0 && hoursUntil <= 6 ? { code: 'STARTING_SOON' } : undefined
    );
  }

  return builder.build();
}
