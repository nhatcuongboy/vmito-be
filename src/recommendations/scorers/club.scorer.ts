import {
  Recommendation,
  UserRecommendationContext,
} from '../recommendation.types';
import {
  ScoreBuilder,
  distanceScore,
  levelScore,
  normalizeArea,
  weeklySlotsScore,
} from '../recommendation.utils';

/** Clubs are joined for the long run, so allow a wider radius than kèo. */
const RADIUS_KM = 20;
/** Weekly play over the last 30 days counts as "sôi nổi". */
const ACTIVE_RECENT_SESSIONS = 4;
const FRIENDS_FOR_FULL_SCORE = 3;

export interface ScorableClub {
  hostId: string;
  requiredLevels: number[];
  sessionCount: number;
  defaultVenueId: string | null;
  defaultVenue: {
    lat: number | null;
    lng: number | null;
    district: string | null;
    newDistrict: string | null;
  } | null;
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export interface ClubSignals {
  /** Viewer's friends who are active members. */
  friendMembers: number;
  /** Sessions the club ran in the last 30 days. */
  recentSessions: number;
  /** Highest [recentSessions] among the candidates, for normalization. */
  maxRecentSessions: number;
}

/**
 * Weights (sum 1): level .25, friends .20, distance .15, schedule .15,
 * venue .10, activity .15.
 */
export function scoreClub(
  club: ScorableClub,
  ctx: UserRecommendationContext,
  signals: ClubSignals
): Recommendation {
  const builder = new ScoreBuilder();

  builder.add(0.25, levelScore(ctx, club.requiredLevels), {
    code: 'LEVEL_MATCH',
  });

  // A host the viewer already plays with counts like one more friend.
  const hostAffinity = ctx.hostAffinity.get(club.hostId) ?? 0;
  const friends = signals.friendMembers + (hostAffinity >= 0.5 ? 1 : 0);
  builder.add(
    0.2,
    friends / FRIENDS_FOR_FULL_SCORE,
    signals.friendMembers > 0
      ? { code: 'FRIENDS_IN_CLUB', value: signals.friendMembers }
      : hostAffinity >= 0.5
        ? { code: 'FAMILIAR_HOST' }
        : undefined,
    1 / FRIENDS_FOR_FULL_SCORE
  );

  const distance = distanceScore(
    ctx,
    club.defaultVenue?.lat,
    club.defaultVenue?.lng,
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

  builder.add(0.15, weeklySlotsScore(ctx, club.schedules), {
    code: 'USUAL_SCHEDULE',
  });

  let venue = club.defaultVenueId
    ? (ctx.venueAffinity.get(club.defaultVenueId) ?? 0)
    : 0;
  const district = normalizeArea(
    club.defaultVenue?.newDistrict ?? club.defaultVenue?.district
  );
  if (venue === 0 && district && ctx.usualDistricts.has(district)) {
    venue = 0.4;
  }
  builder.add(0.1, venue, { code: 'FAMILIAR_VENUE' }, 0.5);

  const recent =
    signals.maxRecentSessions > 0
      ? signals.recentSessions / signals.maxRecentSessions
      : 0;
  // Recent activity dominates: a club with a long history that stopped
  // playing is not a good recommendation.
  const activity = 0.7 * recent + 0.3 * Math.min(1, club.sessionCount / 50);
  builder.add(
    0.15,
    activity,
    signals.recentSessions >= ACTIVE_RECENT_SESSIONS
      ? { code: 'ACTIVE_CLUB' }
      : undefined,
    0
  );

  return builder.build();
}
