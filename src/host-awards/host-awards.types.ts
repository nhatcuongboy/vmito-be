import { HostAwardCategory } from '@prisma/client';
import { ScoreComponent } from './host-awards.constants';

export interface AwardMatch {
  status: string;
  startTime: Date;
  endTime: Date | null;
  /** Player (slot) ids that took part. */
  playerIds: string[];
}

export interface AwardPlayer {
  id: string;
  userId: string | null;
  createdByUserId: string | null;
  matchesPlayed: number;
}

/** A FINISHED, non-crawled session that ended inside the month. */
export interface AwardSession {
  id: string;
  hostId: string;
  startTime: Date | null;
  endTime: Date | null;
  isInternal: boolean;
  players: AwardPlayer[];
  matches: AwardMatch[];
}

export interface AwardUser {
  id: string;
  createdAt: Date;
  /** Email verified or signed in through an OAuth provider. */
  trusted: boolean;
  isAdmin: boolean;
  /** Hosts this account registered itself to play with (lifetime). */
  hostsPlayed: Set<string>;
}

export interface AwardRating {
  id: string;
  sessionId: string;
  raterUserId: string;
  ratedUserId: string;
  type: 'PLAYER_TO_HOST' | 'HOST_TO_PLAYER';
  rating: number;
  createdAt: Date;
}

/** One lifetime session a user played in (linked slot, ≥ 1 match). */
export interface ParticipationRow {
  sessionId: string;
  hostId: string;
  endTime: Date | null;
  selfRegistered: boolean;
}

/** Everything the pure scoring pipeline needs for one month. */
export interface MonthDataset {
  start: Date;
  end: Date;
  /** Moment the data was read; growth looks at plays up to here. */
  asOf: Date;
  sessions: AwardSession[];
  cancelledByHost: Map<string, number>;
  users: Map<string, AwardUser>;
  deviceIdsByUser: Map<string, string[]>;
  ratings: AwardRating[];
  participationByUser: Map<string, ParticipationRow[]>;
  /** (blocker, blocked=host) pairs where the blocker played for that host. */
  blocks: { blockerId: string; blockedId: string }[];
  firstHostedAt: Map<string, Date>;
  sanctionedHostIds: Set<string>;
}

export type FlagSeverity = 'red' | 'yellow';

export interface AwardFlag {
  code: string;
  severity: FlagSeverity;
  detail: string;
}

export interface HostMetrics {
  hostId: string;
  qualifiedSessions: number;
  /** Capped, internal-weighted count of qualified sessions. */
  activity: number;
  distinctPlayers: number;
  returningPlayers: number;
  retention: number;
  growth: number;
  ratingCount: number;
  ratingAverage: number | null;
  quality: number;
  finishedSessions: number;
  cancelledSessions: number;
  cancelRate: number;
  hostAccountAgeDays: number;
  hostingAgeDays: number | null;
  medianMatchMinutes: number | null;
}

export interface FraudResult {
  flags: AwardFlag[];
  trustFactor: number;
  /** Reciprocal 5★ ratings that must not count. */
  ignoredRatingIds: Set<string>;
  /** Rating pattern looks bought — Quality falls back to the global mean. */
  ignoreAllRatings: boolean;
}

export interface ScoredHost {
  hostId: string;
  score: number;
  components: Record<ScoreComponent, number>;
  reliability: number;
  trustFactor: number;
}

export interface CategoryPick {
  hostId: string;
  category: HostAwardCategory;
  rank: number;
  score: number;
}
