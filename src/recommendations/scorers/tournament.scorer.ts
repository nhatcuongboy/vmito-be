import { CategoryType, Gender, TournamentStatus } from '@prisma/client';
import {
  Recommendation,
  UserRecommendationContext,
} from '../recommendation.types';
import { ScoreBuilder, distanceScore } from '../recommendation.utils';

/** People travel further for a tournament than for a kèo. */
const RADIUS_KM = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const FRIENDS_FOR_FULL_SCORE = 3;

export interface ScorableTournament {
  hostId: string;
  status: TournamentStatus;
  startDate: Date;
  registrationOpen: boolean;
  registrationDeadline: Date | null;
  venue: { lat: number | null; lng: number | null } | null;
  tournamentVenues: {
    venue: { lat: number | null; lng: number | null } | null;
  }[];
  categories: { type: CategoryType }[];
}

export interface TournamentSignals {
  /** Viewer's friends registered as players. */
  friendPlayers: number;
}

/**
 * Categories carry no level, so the level weight of the original plan goes
 * to gender fit (whether there is an event the viewer can enter at all).
 *
 * Weights (sum 1): gender fit .25, timing .20, friends .20, distance .20,
 * familiar organizer .15.
 */
export function scoreTournament(
  tournament: ScorableTournament,
  ctx: UserRecommendationContext,
  signals: TournamentSignals,
  now: Date = new Date()
): Recommendation {
  const builder = new ScoreBuilder();

  builder.add(0.25, genderFit(ctx.gender, tournament.categories), {
    code: 'GENDER_MATCH',
  });

  const timing = timingScore(tournament, now);
  builder.add(
    0.2,
    timing.score,
    timing.isClosingSoon ? { code: 'REG_CLOSING' } : undefined
  );

  builder.add(
    0.2,
    signals.friendPlayers / FRIENDS_FOR_FULL_SCORE,
    signals.friendPlayers > 0
      ? { code: 'FRIENDS_JOINED', value: signals.friendPlayers }
      : undefined,
    1 / FRIENDS_FOR_FULL_SCORE
  );

  const place =
    tournament.venue ??
    tournament.tournamentVenues.find((tv) => tv.venue)?.venue ??
    null;
  const distance = distanceScore(ctx, place?.lat, place?.lng, RADIUS_KM);
  builder.add(
    0.2,
    distance.score,
    distance.km != null
      ? { code: 'NEAR', value: Math.round(distance.km * 10) / 10 }
      : undefined,
    0.6
  );

  builder.add(
    0.15,
    ctx.hostAffinity.get(tournament.hostId) ?? 0,
    { code: 'FAMILIAR_HOST' },
    0.5
  );

  return builder.build();
}

/** 1 when an event exists for the viewer's gender; neutral when unknown. */
function genderFit(
  gender: Gender | null,
  categories: { type: CategoryType }[]
): number {
  if (categories.length === 0) return 0.5;
  const open: CategoryType[] = [CategoryType.MIXED_DOUBLE, CategoryType.CUSTOM];
  const allowed: CategoryType[] =
    gender === Gender.MALE
      ? [...open, CategoryType.MENS_SINGLE, CategoryType.MENS_DOUBLE]
      : gender === Gender.FEMALE
        ? [...open, CategoryType.WOMENS_SINGLE, CategoryType.WOMENS_DOUBLE]
        : [];
  if (allowed.length === 0) return 0.5;
  return categories.some((c) => allowed.includes(c.type)) ? 1 : 0;
}

/**
 * Open registration closing within a week is the most actionable, then any
 * open registration, then an upcoming event; running ones are watch-only.
 */
function timingScore(
  tournament: ScorableTournament,
  now: Date
): { score: number; isClosingSoon: boolean } {
  if (tournament.status === TournamentStatus.IN_PROGRESS) {
    return { score: 0.4, isClosingSoon: false };
  }
  if (tournament.status !== TournamentStatus.PREPARING) {
    return { score: 0, isClosingSoon: false };
  }
  const deadline = tournament.registrationDeadline;
  if (tournament.registrationOpen && (!deadline || deadline > now)) {
    const isClosingSoon =
      !!deadline && deadline.getTime() - now.getTime() <= 7 * DAY_MS;
    return { score: isClosingSoon ? 1 : 0.75, isClosingSoon };
  }
  const daysToStart = (tournament.startDate.getTime() - now.getTime()) / DAY_MS;
  return { score: daysToStart <= 14 ? 0.5 : 0.3, isClosingSoon: false };
}
