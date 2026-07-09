import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TournamentCourtStatus,
  MatchStatus,
  ScheduleType,
  Prisma,
} from '@prisma/client';
import {
  CourtAvailability,
  QueuedMatch,
  ScheduleAssignment,
  ScheduleConflict,
  AutoAssignmentResult,
  MatchParticipantSummary,
} from '../types/schedule.types';
import {
  TournamentsGateway,
  TournamentEventType,
} from '../realtime/tournaments.gateway';

@Injectable()
export class ScheduleService {
  constructor(
    private prisma: PrismaService,
    private gateway: TournamentsGateway
  ) {}

  /**
   * Tell everyone watching the tournament that the live queue / court
   * assignments changed so they can refetch. Carries no payload.
   */
  private notifyScheduleChanged(tournamentId: string): void {
    this.gateway.notifyTournamentEvent(
      tournamentId,
      TournamentEventType.TOURNAMENT_SCHEDULE_UPDATED,
      {}
    );
  }

  /**
   * Prisma include that resolves each participant down to a display name
   * (singles player name or doubles pair member names).
   */
  private static readonly PARTICIPANT_INCLUDE = {
    participants: {
      include: {
        categoryRegistration: {
          include: {
            player: { select: { id: true, name: true } },
            pair: {
              include: {
                members: {
                  include: { player: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    },
  } as const;

  /**
   * Map resolved participant rows to {id, name} display summaries.
   */
  private mapParticipants(
    participants: {
      categoryRegistration: {
        player: { id: string; name: string } | null;
        pair: { id: string; members: { player: { name: string } }[] } | null;
      };
    }[]
  ): MatchParticipantSummary[] {
    return participants.map((p) => {
      const reg = p.categoryRegistration;
      if (reg.player) {
        return { id: reg.player.id, name: reg.player.name };
      } else if (reg.pair) {
        const names = reg.pair.members.map((m) => m.player.name).join(' / ');
        return { id: reg.pair.id, name: names };
      }
      return { id: '', name: 'Unknown' };
    });
  }

  /**
   * Ensure the caller owns the tournament before mutating/reading its schedule.
   */
  private async verifyOwnership(
    tournamentId: string,
    userId: string
  ): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { hostId: true },
    });
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.hostId !== userId) {
      throw new ForbiddenException('You are not the owner of this tournament');
    }
  }

  /**
   * Ensure a match belongs to the given tournament (prevents cross-tournament
   * mutation when callers only pass a matchId).
   */
  private async assertMatchInTournament(
    tournamentId: string,
    matchId: string
  ): Promise<void> {
    const match = await this.prisma.categoryMatch.findFirst({
      where: { id: matchId, category: { tournamentId } },
      select: { id: true },
    });
    if (!match) {
      throw new NotFoundException('Match not found in this tournament');
    }
  }

  /**
   * Collect the set of categoryRegistrationIds that are currently occupied:
   * playing a live match, or already assigned to a court awaiting play. Used to
   * prevent assigning a queued match while one of its participants is busy.
   */
  private async getBusyRegistrationIds(
    tournamentId: string
  ): Promise<Set<string>> {
    const busyMatches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        OR: [
          { status: MatchStatus.IN_PROGRESS },
          { status: MatchStatus.SCHEDULED, courtId: { not: null } },
        ],
      },
      select: {
        participants: { select: { categoryRegistrationId: true } },
      },
    });

    const ids = new Set<string>();
    for (const match of busyMatches) {
      for (const p of match.participants) {
        if (p.categoryRegistrationId) ids.add(p.categoryRegistrationId);
      }
    }
    return ids;
  }

  /**
   * Seed the queue for "Next Available Court" mode: mark every unscheduled,
   * not-yet-played match as queued and assign an incremental queueOrder. The
   * host can reorder afterwards via reorderQueue.
   */
  async initializeQueue(
    tournamentId: string,
    userId: string
  ): Promise<{ queuedCount: number }> {
    await this.verifyOwnership(tournamentId, userId);

    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      orderBy: [{ createdAt: 'asc' }, { matchNumber: 'asc' }],
      select: { id: true },
    });

    await this.prisma.$transaction(
      matches.map((m, index) =>
        this.prisma.categoryMatch.update({
          where: { id: m.id },
          data: { isQueued: true, queueOrder: index + 1 },
        })
      )
    );

    this.notifyScheduleChanged(tournamentId);
    return { queuedCount: matches.length };
  }

  /**
   * Keep the live queue consistent when a tournament's schedule type changes.
   * Switching to NEXT_AVAILABLE seeds the queue (idempotent — preserves the
   * order of already-queued matches and appends new ones). Switching to
   * ASSIGNED clears queue flags. Called internally after an authorized update,
   * so it performs no ownership check.
   */
  async syncQueueForScheduleType(
    tournamentId: string,
    type: ScheduleType
  ): Promise<void> {
    if (type === ScheduleType.ASSIGNED) {
      await this.prisma.categoryMatch.updateMany({
        where: { category: { tournamentId }, isQueued: true },
        data: { isQueued: false, queueOrder: null },
      });
      this.notifyScheduleChanged(tournamentId);
      return;
    }

    // NEXT_AVAILABLE: existing queued matches keep their relative order; any
    // unqueued, not-yet-scheduled matches are appended.
    const queued = await this.prisma.categoryMatch.findMany({
      where: { category: { tournamentId }, isQueued: true, courtId: null },
      orderBy: { queueOrder: 'asc' },
      select: { id: true },
    });
    const unqueued = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        isQueued: false,
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      orderBy: [{ createdAt: 'asc' }, { matchNumber: 'asc' }],
      select: { id: true },
    });

    const ordered = [...queued, ...unqueued];
    await this.prisma.$transaction(
      ordered.map((m, index) =>
        this.prisma.categoryMatch.update({
          where: { id: m.id },
          data: { isQueued: true, queueOrder: index + 1 },
        })
      )
    );

    this.notifyScheduleChanged(tournamentId);
  }

  /**
   * Get available courts for a tournament
   */
  async getAvailableCourts(
    tournamentId: string,
    userId: string
  ): Promise<CourtAvailability[]> {
    await this.verifyOwnership(tournamentId, userId);

    const courts = await this.prisma.tournamentCourt.findMany({
      where: { tournamentId },
      include: {
        currentMatch: {
          select: {
            id: true,
            categoryId: true,
            round: true,
            matchNumber: true,
            status: true,
            startTime: true,
            scheduledDuration: true,
            ...ScheduleService.PARTICIPANT_INCLUDE,
          },
        },
      },
      orderBy: { courtNumber: 'asc' },
    });

    return courts.map((court) => {
      const cm = court.currentMatch;
      return {
        courtId: court.id,
        courtNumber: court.courtNumber,
        courtName: court.courtName || undefined,
        status: court.status,
        currentMatchId: court.currentMatchId || undefined,
        currentMatch: cm
          ? {
              matchId: cm.id,
              categoryId: cm.categoryId,
              round: cm.round,
              matchNumber: cm.matchNumber,
              status: cm.status,
              participants: this.mapParticipants(cm.participants),
            }
          : undefined,
        estimatedAvailableAt: cm?.startTime
          ? new Date(
              cm.startTime.getTime() + (cm.scheduledDuration || 30) * 60000
            )
          : undefined,
      };
    });
  }

  /**
   * Get queued matches waiting for court assignment
   */
  async getQueuedMatches(
    tournamentId: string,
    userId: string
  ): Promise<QueuedMatch[]> {
    await this.verifyOwnership(tournamentId, userId);

    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        isQueued: true,
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      include: ScheduleService.PARTICIPANT_INCLUDE,
      orderBy: { queueOrder: 'asc' },
    });

    return matches.map((match) => ({
      matchId: match.id,
      categoryId: match.categoryId,
      round: match.round,
      matchNumber: match.matchNumber,
      queueOrder: match.queueOrder || 0,
      estimatedDuration: match.scheduledDuration || undefined,
      participants: this.mapParticipants(match.participants),
    }));
  }

  /**
   * Matches eligible to be added to the queue: scheduled, not yet on a court,
   * and not already queued. Used by the "add match" picker.
   */
  async getUnqueuedMatches(
    tournamentId: string,
    userId: string
  ): Promise<QueuedMatch[]> {
    await this.verifyOwnership(tournamentId, userId);

    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        isQueued: false,
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      include: ScheduleService.PARTICIPANT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { matchNumber: 'asc' }],
    });

    return matches.map((match) => ({
      matchId: match.id,
      categoryId: match.categoryId,
      round: match.round,
      matchNumber: match.matchNumber,
      queueOrder: match.queueOrder || 0,
      estimatedDuration: match.scheduledDuration || undefined,
      participants: this.mapParticipants(match.participants),
    }));
  }

  /**
   * Return a court's match to the queue (undo an assignment). Only matches that
   * have not started yet (still SCHEDULED) can be returned; in-progress or
   * finished matches keep their court.
   */
  async unassignMatch(
    tournamentId: string,
    matchId: string,
    userId: string
  ): Promise<void> {
    await this.verifyOwnership(tournamentId, userId);

    const match = await this.prisma.categoryMatch.findFirst({
      where: { id: matchId, category: { tournamentId } },
      select: { id: true, courtId: true, status: true },
    });
    if (!match) {
      throw new NotFoundException('Match not found in this tournament');
    }
    if (match.status !== MatchStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only matches that have not started can be returned to the queue'
      );
    }

    // Append to the end of the queue.
    const lastMatch = await this.prisma.categoryMatch.findFirst({
      where: { isQueued: true, category: { tournamentId } },
      orderBy: { queueOrder: 'desc' },
    });
    const queueOrder = (lastMatch?.queueOrder || 0) + 1;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.categoryMatch.update({
        where: { id: matchId },
        data: {
          courtId: null,
          startTime: null,
          estimatedEndTime: null,
          autoAssignedAt: null,
          assignedBy: null,
          isQueued: true,
          queueOrder,
        },
      }),
    ];
    if (match.courtId) {
      ops.push(
        this.prisma.tournamentCourt.update({
          where: { id: match.courtId },
          data: {
            status: TournamentCourtStatus.AVAILABLE,
            currentMatchId: null,
          },
        })
      );
    }
    await this.prisma.$transaction(ops);

    this.notifyScheduleChanged(tournamentId);
  }

  /**
   * Auto-assign next match to available court (Next Available Court mode).
   *
   * When called from an HTTP endpoint, pass userId to enforce ownership. When
   * called internally (e.g. after a match finishes) userId is omitted — the
   * operation is already scoped to a single tournament.
   */
  async autoAssignNextMatch(
    tournamentId: string,
    userId?: string
  ): Promise<AutoAssignmentResult> {
    if (userId) {
      await this.verifyOwnership(tournamentId, userId);
    }

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

    // Registrations currently busy: anyone in a live match or already sitting
    // on a court. We must not pull a queued match whose participants are still
    // playing elsewhere (PARTICIPANT_OVERLAP).
    const busyRegistrationIds = await this.getBusyRegistrationIds(tournamentId);

    // Walk the queue in priority order and pick the first match whose
    // participants are all free.
    const queuedMatches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        isQueued: true,
        status: MatchStatus.SCHEDULED,
        courtId: null,
      },
      orderBy: { queueOrder: 'asc' },
      include: {
        participants: { select: { categoryRegistrationId: true } },
      },
    });

    if (queuedMatches.length === 0) {
      return {
        success: false,
        matchId: '',
        error: 'No matches in queue',
      };
    }

    const nextMatch = queuedMatches.find((m) =>
      m.participants.every(
        (p) =>
          !p.categoryRegistrationId ||
          !busyRegistrationIds.has(p.categoryRegistrationId)
      )
    );

    if (!nextMatch) {
      return {
        success: false,
        matchId: '',
        error: 'Next queued match participants are still playing',
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

    this.notifyScheduleChanged(tournamentId);
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

    // Check player overlap: any other time-overlapping match that shares a
    // participant with this one.
    const participants = await this.prisma.categoryMatchParticipant.findMany({
      where: { matchId },
      select: { categoryRegistrationId: true },
    });
    const registrationIds = participants
      .map((p) => p.categoryRegistrationId)
      .filter((id): id is string => Boolean(id));

    if (registrationIds.length > 0) {
      const playerConflicts = await this.prisma.categoryMatch.findMany({
        where: {
          id: { not: matchId },
          status: { in: [MatchStatus.SCHEDULED, MatchStatus.IN_PROGRESS] },
          participants: {
            some: { categoryRegistrationId: { in: registrationIds } },
          },
          AND: [
            { startTime: { lt: estimatedEndTime } },
            { estimatedEndTime: { gt: startTime } },
          ],
        },
        select: {
          id: true,
          participants: { select: { categoryRegistrationId: true } },
        },
      });

      playerConflicts.forEach((conflictMatch) => {
        const sharedPlayerId = conflictMatch.participants.find((p) =>
          registrationIds.includes(p.categoryRegistrationId ?? '')
        )?.categoryRegistrationId;
        conflicts.push({
          type: 'PLAYER_OVERLAP',
          matchId,
          conflictingMatchId: conflictMatch.id,
          playerId: sharedPlayerId ?? undefined,
          timeRange: {
            start: startTime,
            end: estimatedEndTime,
          },
        });
      });
    }

    return conflicts;
  }

  /**
   * Add match to queue (Next Available Court mode)
   */
  async addMatchToQueue(
    tournamentId: string,
    matchId: string,
    userId: string,
    queueOrder?: number
  ): Promise<void> {
    await this.verifyOwnership(tournamentId, userId);
    await this.assertMatchInTournament(tournamentId, matchId);

    // If no queue order specified, add to the end of THIS tournament's queue.
    if (queueOrder === undefined) {
      const lastMatch = await this.prisma.categoryMatch.findFirst({
        where: { isQueued: true, category: { tournamentId } },
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

    this.notifyScheduleChanged(tournamentId);
  }

  /**
   * Remove match from queue
   */
  async removeMatchFromQueue(
    tournamentId: string,
    matchId: string,
    userId: string
  ): Promise<void> {
    await this.verifyOwnership(tournamentId, userId);
    await this.assertMatchInTournament(tournamentId, matchId);

    await this.prisma.categoryMatch.update({
      where: { id: matchId },
      data: {
        isQueued: false,
        queueOrder: null,
      },
    });

    this.notifyScheduleChanged(tournamentId);
  }

  /**
   * Reorder queue
   */
  async reorderQueue(
    tournamentId: string,
    matchIds: string[],
    userId: string
  ): Promise<void> {
    await this.verifyOwnership(tournamentId, userId);

    const count = await this.prisma.categoryMatch.count({
      where: { id: { in: matchIds }, category: { tournamentId } },
    });
    if (count !== matchIds.length) {
      throw new BadRequestException(
        'Some matches do not belong to this tournament'
      );
    }

    const updates = matchIds.map((matchId, index) =>
      this.prisma.categoryMatch.update({
        where: { id: matchId },
        data: { queueOrder: index + 1 },
      })
    );

    await this.prisma.$transaction(updates);
    this.notifyScheduleChanged(tournamentId);
  }
}
