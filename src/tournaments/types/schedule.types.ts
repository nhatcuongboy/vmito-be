import { ScheduleType, TournamentCourtStatus } from '@prisma/client';

/**
 * Schedule configuration for tournament
 */
export interface ScheduleConfig {
  type: ScheduleType;
  averageMatchDuration?: number; // in minutes
  courtCount: number;
}

/**
 * Court availability info for Next Available Court mode
 */
export interface CourtAvailability {
  courtId: string;
  courtNumber: number;
  courtName?: string;
  status: TournamentCourtStatus;
  currentMatchId?: string;
  estimatedAvailableAt?: Date;
}

/**
 * Match queue item for Next Available Court mode
 */
export interface QueuedMatch {
  matchId: string;
  categoryId: string;
  round: string;
  matchNumber: number;
  queueOrder: number;
  estimatedDuration?: number;
  participants: {
    id: string;
    name: string;
  }[];
}

/**
 * Schedule assignment for Assigned Courts & Times mode
 */
export interface ScheduleAssignment {
  matchId: string;
  courtId: string;
  startTime: Date;
  estimatedEndTime: Date;
  duration: number;
}

/**
 * Schedule conflict detection result
 */
export interface ScheduleConflict {
  type: 'COURT_OVERLAP' | 'PLAYER_OVERLAP';
  matchId: string;
  conflictingMatchId: string;
  courtId?: string;
  playerId?: string;
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Auto-assignment result
 */
export interface AutoAssignmentResult {
  success: boolean;
  matchId: string;
  courtId?: string;
  assignedAt?: Date;
  error?: string;
}
