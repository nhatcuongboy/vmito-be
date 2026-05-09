import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentCourtStatus, MatchStatus } from '@prisma/client';
import {
  CourtAvailability,
  QueuedMatch,
  ScheduleAssignment,
  ScheduleConflict,
  AutoAssignmentResult,
} from '../types/schedule.types';

@Injectable()
export class ScheduleService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get available courts for a tournament
   */
  async getAvailableCourts(tournamentId: string): Promise<CourtAvailability[]> {
    const courts = await this.prisma.tournamentCourt.findMany({
      where: { tournamentId },
      include: {
        currentMatch: {
          select: {
            id: true,
            startTime: true,
            scheduledDuration: true,
          },
        },
      },
      orderBy: { courtNumber: 'asc' },
    });

    return courts.map((court) => ({
      courtId: court.id,
      courtNumber: court.courtNumber,
      courtName: court.courtName || undefined,
      status: court.status,
      currentMatchId: court.currentMatchId || undefined,
      estimatedAvailableAt: court.currentMatch?.startTime
        ? new Date(
            court.currentMatch.startTime.getTime() +
              (court.currentMatch.scheduledDuration || 30) * 60000
          )
        : undefined,
    }));
  }

  /**
   * Get queued matches waiting for court assignment
   */
  async getQueuedMatches(tournamentId: string): Promise<QueuedMatch[]> {
    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        isQueued: true,
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: { select: { id: true, name: true } },
                pair: {
                  include: {
                    members: {
                      include: {
                        player: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { queueOrder: 'asc' },
    });

    return matches.map((match) => ({
      matchId: match.id,
      categoryId: match.categoryId,
      round: match.round,
      matchNumber: match.matchNumber,
      queueOrder: match.queueOrder || 0,
      estimatedDuration: match.scheduledDuration || undefined,
      participants: match.participants.map((p) => {
        const reg = p.categoryRegistration;
        if (reg.player) {
          return { id: reg.player.id, name: reg.player.name };
        } else if (reg.pair) {
          const names = reg.pair.members.map((m) => m.player.name).join(' / ');
          return { id: reg.pair.id, name: names };
        }
        return { id: '', name: 'Unknown' };
      }),
    }));
  }

  /**
   * Auto-assign next match to available court (Next Available Court mode)
   */
  async autoAssignNextMatch(
    tournamentId: string
  ): Promise<AutoAssignmentResult> {
    // Get first available court
    const availableCourt = await this.prisma.tournamentCourt.findFirst({
      where: {
        tournamentId,
        status: TournamentCourtStatus.AVAILABLE,
      },
      orderBy: { courtNumber: 'asc' },
    });

    if (!availableCourt) {
      return {
        success: false,
        matchId: '',
        error: 'No available courts',
      };
    }

    // Get next queued match
    const nextMatch = await this.prisma.categoryMatch.findFirst({
      where: {
        category: { tournamentId },
        isQueued: true,
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      orderBy: { queueOrder: 'asc' },
    });

    if (!nextMatch) {
      return {
        success: false,
        matchId: '',
        error: 'No matches in queue',
      };
    }

    // Assign match to court
    const now = new Date();
    await this.prisma.$transaction([
      // Update match
      this.prisma.categoryMatch.update({
        where: { id: nextMatch.id },
        data: {
          courtId: availableCourt.id,
          startTime: now,
          autoAssignedAt: now,
          assignedBy: 'AUTO',
          isQueued: false,
        },
      }),
      // Update court status
      this.prisma.tournamentCourt.update({
        where: { id: availableCourt.id },
        data: {
          status: TournamentCourtStatus.OCCUPIED,
          currentMatchId: nextMatch.id,
        },
      }),
    ]);

    return {
      success: true,
      matchId: nextMatch.id,
      courtId: availableCourt.id,
      assignedAt: now,
    };
  }

  /**
   * Mark court as available when match finishes
   */
  async releaseCourtAfterMatch(matchId: string): Promise<void> {
    const match = await this.prisma.categoryMatch.findUnique({
      where: { id: matchId },
      select: { courtId: true },
    });

    if (!match?.courtId) return;

    await this.prisma.tournamentCourt.update({
      where: { id: match.courtId },
      data: {
        status: TournamentCourtStatus.AVAILABLE,
        currentMatchId: null,
      },
    });
  }

  /**
   * Manually assign match to court and time (Assigned Courts & Times mode)
   */
  async assignMatchToCourtAndTime(
    assignment: ScheduleAssignment
  ): Promise<void> {
    // Check for conflicts
    const conflicts = await this.detectScheduleConflicts(assignment);
    if (conflicts.length > 0) {
      throw new BadRequestException({
        message: 'Schedule conflicts detected',
        conflicts,
      });
    }

    // Calculate estimated end time
    const estimatedEndTime = new Date(
      assignment.startTime.getTime() + assignment.duration * 60000
    );

    await this.prisma.categoryMatch.update({
      where: { id: assignment.matchId },
      data: {
        courtId: assignment.courtId,
        startTime: assignment.startTime,
        scheduledDuration: assignment.duration,
        estimatedEndTime,
        assignedBy: 'MANUAL',
      },
    });
  }

  /**
   * Detect schedule conflicts for a given assignment
   */
  async detectScheduleConflicts(
    assignment: ScheduleAssignment
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];
    const { matchId, courtId, startTime, estimatedEndTime } = assignment;

    // Check court overlap
    const courtConflicts = await this.prisma.categoryMatch.findMany({
      where: {
        courtId,
        id: { not: matchId },
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.IN_PROGRESS] },
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { estimatedEndTime: { gte: startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lte: estimatedEndTime } },
              { estimatedEndTime: { gte: estimatedEndTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: startTime } },
              { estimatedEndTime: { lte: estimatedEndTime } },
            ],
          },
        ],
      },
    });

    courtConflicts.forEach((conflictMatch) => {
      conflicts.push({
        type: 'COURT_OVERLAP',
        matchId,
        conflictingMatchId: conflictMatch.id,
        courtId,
        timeRange: {
          start: startTime,
          end: estimatedEndTime,
        },
      });
    });

    // TODO: Check player overlap (requires fetching participants)

    return conflicts;
  }

  /**
   * Add match to queue (Next Available Court mode)
   */
  async addMatchToQueue(matchId: string, queueOrder?: number): Promise<void> {
    // If no queue order specified, add to end
    if (queueOrder === undefined) {
      const lastMatch = await this.prisma.categoryMatch.findFirst({
        where: { isQueued: true },
        orderBy: { queueOrder: 'desc' },
      });
      queueOrder = (lastMatch?.queueOrder || 0) + 1;
    }

    await this.prisma.categoryMatch.update({
      where: { id: matchId },
      data: {
        isQueued: true,
        queueOrder,
      },
    });
  }

  /**
   * Remove match from queue
   */
  async removeMatchFromQueue(matchId: string): Promise<void> {
    await this.prisma.categoryMatch.update({
      where: { id: matchId },
      data: {
        isQueued: false,
        queueOrder: null,
      },
    });
  }

  /**
   * Reorder queue
   */
  async reorderQueue(matchIds: string[]): Promise<void> {
    const updates = matchIds.map((matchId, index) =>
      this.prisma.categoryMatch.update({
        where: { id: matchId },
        data: { queueOrder: index + 1 },
      })
    );

    await this.prisma.$transaction(updates);
  }
}
