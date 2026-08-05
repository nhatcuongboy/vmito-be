// Metadata shapes stored in Post.metadata (Json) per ActivityType.
// Keep these in sync with the FE mirror in vmito-fe/src/types/post.ts.

export interface SessionCreatedMetadata {
  sessionId: string;
  sessionSlug?: string | null;
  sessionName: string;
  coverPhoto?: string | null;
  scheduledStartTime?: string | null;
  location?: string | null;
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
}

export interface ClubMetadata {
  clubId: string;
  clubSlug?: string | null;
  clubName: string;
  logo?: string | null;
}

export interface TournamentCreatedMetadata {
  tournamentId: string;
  tournamentSlug?: string | null;
  tournamentName: string;
  coverPhoto?: string | null;
  startDate?: string | null;
  venueName?: string | null;
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
