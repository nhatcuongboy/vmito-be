// Metadata shapes stored in Post.metadata (Json) per ActivityType.
// Keep these in sync with the FE mirror in vmito-fe/src/types/post.ts.
import { ClubJoinPolicy, SportType } from '@prisma/client';

export interface SessionCreatedMetadata {
  sessionId: string;
  sessionSlug?: string | null;
  sessionName: string;
  coverPhoto?: string | null;
  scheduledStartTime?: string | null;
  location?: string | null;
  sportType: SportType;
}

export interface SessionResultsStanding {
  rank: number;
  playerNumber: number;
  name: string;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  totalWaitTime: number;
  userId?: string | null;
  image?: string | null;
}

export interface SessionResultsMetadata {
  sessionId: string;
  sessionSlug?: string | null;
  sessionName: string;
  endTime?: string | null;
  standings: SessionResultsStanding[];
  sportType: SportType;
}

export interface ClubScheduleMetadata {
  dayOfWeek: number; // 0 = CN … 6 = T7, same as ClubSchedule
  startTime: string; // "19:00"
  endTime: string;
}

export interface ClubMetadata {
  clubId: string;
  clubSlug?: string | null;
  clubName: string;
  logo?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  numberOfCourts?: number | null;
  // Plain-text excerpt (≤160 chars) of the club description, not the stored
  // HTML. Only on CLUB_CREATED / CLUB_UPDATED.
  description?: string | null;
  // Snapshot of what a reader needs to decide whether to join. Only on
  // CLUB_CREATED / CLUB_UPDATED; absent on older posts and CLUB_MEMBER_JOINED.
  schedules?: ClubScheduleMetadata[];
  joinPolicy?: ClubJoinPolicy;
  requiredLevels?: number[]; // empty = every level
}

export interface TournamentCreatedMetadata {
  tournamentId: string;
  tournamentSlug?: string | null;
  tournamentName: string;
  coverPhoto?: string | null;
  startDate?: string | null;
  venueName?: string | null;
  sportType: SportType;
}

export interface TournamentPodiumSide {
  players: Array<{ name: string; userId?: string | null }>;
}

export interface TournamentFinishedCategory {
  categoryId: string;
  categoryName: string;
  champion: TournamentPodiumSide;
  runnerUp?: TournamentPodiumSide | null;
}

export interface TournamentFinishedMetadata {
  tournamentId: string;
  tournamentSlug?: string | null;
  tournamentName: string;
  categories: TournamentFinishedCategory[];
  sportType: SportType;
}

export interface AvatarUpdatedMetadata {
  image: string;
}

export interface CoverPhotoUpdatedMetadata {
  coverPhoto: string;
}

// Intentionally excludes the rating value — ratings are private.
export interface UserRatedMetadata {
  ratedUserId: string;
  ratedName: string;
  ratedImage?: string | null;
  sessionId?: string | null;
}

export type ActivityMetadata =
  | SessionCreatedMetadata
  | SessionResultsMetadata
  | ClubMetadata
  | TournamentCreatedMetadata
  | TournamentFinishedMetadata
  | AvatarUpdatedMetadata
  | CoverPhotoUpdatedMetadata
  | UserRatedMetadata;
