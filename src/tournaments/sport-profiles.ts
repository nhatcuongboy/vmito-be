import { MatchFormat, SportType } from '@prisma/client';

export interface SportScoringDefaults {
  pointsToWin: number;
  winByTwo: boolean;
  pointCap: number | null;
  matchFormat: MatchFormat;
}

export interface TournamentSportProfile {
  sportType: SportType;
  defaultMatchDuration: number;
  defaultScoring: SportScoringDefaults;
}

export const TOURNAMENT_SPORT_PROFILES: Record<
  SportType,
  TournamentSportProfile
> = {
  BADMINTON: {
    sportType: 'BADMINTON',
    defaultMatchDuration: 30,
    defaultScoring: {
      pointsToWin: 21,
      winByTwo: true,
      pointCap: 30,
      matchFormat: 'BEST_OF_3',
    },
  },
  PICKLEBALL: {
    sportType: 'PICKLEBALL',
    defaultMatchDuration: 20,
    defaultScoring: {
      pointsToWin: 11,
      winByTwo: true,
      pointCap: null,
      matchFormat: 'BEST_OF_1',
    },
  },
};

export function normalizeSportType(sportType?: SportType | null): SportType {
  return sportType === 'PICKLEBALL' ? 'PICKLEBALL' : 'BADMINTON';
}

export function getTournamentSportProfile(
  sportType?: SportType | null
): TournamentSportProfile {
  return TOURNAMENT_SPORT_PROFILES[normalizeSportType(sportType)];
}
