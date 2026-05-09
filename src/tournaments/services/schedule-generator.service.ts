import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchStatus } from '@prisma/client';
import { GenerateScheduleDto } from '../dto/schedule-generation.dto';
import { UpdateMatchAssignmentDto } from '../dto/update-match-assignment.dto';
import { ScheduleValidationService } from './schedule-validation.service';
import {
  ScheduleAlgorithmService,
  MatchForScheduling,
  MatchAssignment,
  ScheduleConflictResult,
} from './schedule-algorithm.service';

interface ScheduleSummaryCategory {
  categoryId: string;
  categoryName: string;
  scheduled: number;
  total: number;
  byRound: { round: string; scheduled: number; total: number }[];
}

interface GenerateResponse {
  scheduleId: string;
  summary: {
    totalMatches: number;
    scheduledMatches: number;
    unscheduledMatches: number;
    byCategory: ScheduleSummaryCategory[];
  };
  conflicts: ScheduleConflictResult[];
}

interface PreviewMatch {
  matchId: string;
  matchNumber: number;
  categoryId: string;
  categoryName: string;
  round: string;
  participants: string[];
  courtId: string;
  courtName: string;
  startTime: string;
  endTime: string;
  duration: number;
}

interface GeneratedScheduleRecord {
  id: string;
  tournamentId: string;
  configSnapshot: string;
  assignments: string;
  conflicts: string;
  expiresAt: Date;
}

interface GeneratedScheduleDelegate {
  create(args: {
    data: Omit<GeneratedScheduleRecord, 'id'>;
  }): Promise<GeneratedScheduleRecord>;
  findFirst(args: {
    where: Partial<Pick<GeneratedScheduleRecord, 'id' | 'tournamentId'>>;
  }): Promise<GeneratedScheduleRecord | null>;
  update(args: {
    where: { id: string };
    data: Partial<Omit<GeneratedScheduleRecord, 'id'>>;
  }): Promise<GeneratedScheduleRecord>;
  delete(args: { where: { id: string } }): Promise<GeneratedScheduleRecord>;
  deleteMany(args: {
    where: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

interface PreviewResponse {
  scheduleId: string;
  matches: PreviewMatch[];
}

@Injectable()
export class ScheduleGeneratorService {
  private readonly logger = new Logger(ScheduleGeneratorService.name);

  constructor(
    private prisma: PrismaService,
    private validationService: ScheduleValidationService,
    private algorithmService: ScheduleAlgorithmService
  ) {}

  private get generatedScheduleModel(): GeneratedScheduleDelegate {
    return (this.prisma as unknown as Record<string, unknown>)
      .generatedSchedule as GeneratedScheduleDelegate;
  }

  /**
   * Generate a schedule based on configuration
   */
  async generate(
    tournamentId: string,
    dto: GenerateScheduleDto,
    userId: string
  ): Promise<GenerateResponse> {
    // Verify tournament ownership
    await this.verifyTournamentOwnership(tournamentId, userId);

    // Auto-generate matches for categories/groups that have registrations but no matches
    await this.autoGenerateMissingMatches(tournamentId);

    // Fetch all matches with participants
    const matchesRaw = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        status: { in: [MatchStatus.SCHEDULED] },
      },
      include: {
        participants: {
          select: { categoryRegistrationId: true },
        },
        category: {
          select: { id: true, name: true },
        },
        group: {
          select: { id: true, name: true },
        },
      },
    });

    // Get round types from matches
    const roundTypes = [...new Set(matchesRaw.map((m) => m.round))];

    // Validate configuration
    this.validationService.throwIfInvalid(dto, roundTypes);

    // Transform matches for algorithm
    const matches: MatchForScheduling[] = matchesRaw.map((m) => ({
      id: m.id,
      categoryId: m.categoryId,
      round: m.round,
      matchNumber: m.matchNumber,
      groupId: m.groupId,
      startTime: m.startTime,
      courtId: m.courtId,
      participantIds: m.participants.map((p) => p.categoryRegistrationId),
    }));

    // Run algorithm
    const result = this.algorithmService.generate(
      {
        categoryPriorities: dto.categoryPriorities,
        matchDurations: dto.matchDurations,
        timeSlots: dto.timeSlots.map((ts) => ({
          date: ts.date,
          startTime: ts.startTime,
          endTime: ts.endTime,
          timeBuffer: ts.timeBuffer,
          courts: ts.courts.map((c) => ({
            courtId: c.courtId,
            constraints: c.constraints || null,
          })),
        })),
        keepScheduledMatches: dto.keepScheduledMatches,
      },
      matches
    );

    // Store generated schedule temporarily (expires in 1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const generated = await this.generatedScheduleModel.create({
      data: {
        tournamentId,
        configSnapshot: JSON.stringify(dto),
        assignments: JSON.stringify(result.assignments),
        conflicts: JSON.stringify(result.conflicts),
        expiresAt,
      },
    });

    // Build summary
    const categoryMap = new Map<
      string,
      {
        name: string;
        rounds: Map<string, { scheduled: number; total: number }>;
      }
    >();

    for (const m of matchesRaw) {
      if (!categoryMap.has(m.categoryId)) {
        categoryMap.set(m.categoryId, {
          name: m.category.name,
          rounds: new Map(),
        });
      }
      const cat = categoryMap.get(m.categoryId)!;
      if (!cat.rounds.has(m.round)) {
        cat.rounds.set(m.round, { scheduled: 0, total: 0 });
      }
      cat.rounds.get(m.round)!.total++;
    }

    // Mark scheduled
    for (const assignment of result.assignments) {
      const m = matchesRaw.find((match) => match.id === assignment.matchId);
      if (m) {
        const round = categoryMap.get(m.categoryId)?.rounds.get(m.round);
        if (round?.scheduled !== undefined) {
          round.scheduled++;
        }
      }
    }

    // Also count already-scheduled matches if keepScheduledMatches
    if (dto.keepScheduledMatches) {
      const alreadyScheduled = matchesRaw.filter(
        (m) => m.startTime && m.courtId
      );
      for (const m of alreadyScheduled) {
        const cat = categoryMap.get(m.categoryId);
        if (cat) {
          const round = cat.rounds.get(m.round);
          if (round) {
            round.scheduled++;
          }
        }
      }
    }

    const byCategory: ScheduleSummaryCategory[] = [];
    for (const [categoryId, cat] of categoryMap) {
      const byRound: { round: string; scheduled: number; total: number }[] = [];
      let catScheduled = 0;
      let catTotal = 0;
      for (const [round, counts] of cat.rounds) {
        byRound.push({ round, ...counts });
        catScheduled += counts.scheduled;
        catTotal += counts.total;
      }
      byCategory.push({
        categoryId,
        categoryName: cat.name,
        scheduled: catScheduled,
        total: catTotal,
        byRound,
      });
    }

    const totalMatches = matchesRaw.length;
    const scheduledMatches =
      result.assignments.length +
      (dto.keepScheduledMatches
        ? matchesRaw.filter((m) => m.startTime && m.courtId).length
        : 0);

    return {
      scheduleId: generated.id,
      summary: {
        totalMatches,
        scheduledMatches,
        unscheduledMatches: totalMatches - scheduledMatches,
        byCategory,
      },
      conflicts: result.conflicts,
    };
  }

  /**
   * Get generated schedule for preview
   */
  async getPreview(
    tournamentId: string,
    scheduleId: string,
    userId: string
  ): Promise<PreviewResponse> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const generated = await this.generatedScheduleModel.findFirst({
      where: { id: scheduleId, tournamentId },
    });

    if (!generated || generated.expiresAt < new Date()) {
      throw new NotFoundException('Generated schedule not found or expired');
    }

    const assignments = JSON.parse(generated.assignments) as MatchAssignment[];

    // Fetch match details and court info
    const matchIds = assignments.map((a) => a.matchId);
    const matchesRaw = await this.prisma.categoryMatch.findMany({
      where: { id: { in: matchIds } },
      include: {
        category: { select: { id: true, name: true } },
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: { select: { name: true } },
                pair: {
                  include: {
                    members: {
                      include: {
                        player: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const courts = await this.prisma.tournamentCourt.findMany({
      where: { tournamentId },
    });
    const courtMap = new Map(courts.map((c) => [c.id, c]));
    const matchMap = new Map(matchesRaw.map((m) => [m.id, m]));

    const previewMatches: PreviewMatch[] = assignments.map((a) => {
      const match = matchMap.get(a.matchId);
      const court = courtMap.get(a.courtId);

      const participants = (match?.participants || []).map((p) => {
        const reg = p.categoryRegistration;
        if (reg?.player) return reg.player.name;
        if (reg?.pair) {
          return reg.pair.members.map((m) => m.player.name).join(' / ');
        }
        return 'TBD';
      });

      return {
        matchId: a.matchId,
        matchNumber: match?.matchNumber || 0,
        categoryId: match?.categoryId || '',
        categoryName: match?.category?.name || '',
        round: match?.round || '',
        participants,
        courtId: a.courtId,
        courtName: court?.courtName || `Court ${court?.courtNumber || '?'}`,
        startTime: a.startTime,
        endTime: a.endTime,
        duration: a.duration,
      };
    });

    return {
      scheduleId,
      matches: previewMatches.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
    };
  }

  /**
   * Update a single match assignment in the generated schedule
   */
  async updateMatchAssignment(
    tournamentId: string,
    scheduleId: string,
    matchId: string,
    dto: UpdateMatchAssignmentDto,
    userId: string
  ): Promise<{ success: boolean; conflicts?: ScheduleConflictResult[] }> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const generated = await this.generatedScheduleModel.findFirst({
      where: { id: scheduleId, tournamentId },
    });

    if (!generated || generated.expiresAt < new Date()) {
      throw new NotFoundException('Generated schedule not found or expired');
    }

    const assignments = JSON.parse(generated.assignments) as MatchAssignment[];
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + dto.duration * 60000);

    // Update or add the assignment
    const existingIdx = assignments.findIndex((a) => a.matchId === matchId);
    const updatedAssignment: MatchAssignment = {
      matchId,
      courtId: dto.courtId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: dto.duration,
    };

    if (existingIdx >= 0) {
      assignments[existingIdx] = updatedAssignment;
    } else {
      assignments.push(updatedAssignment);
    }

    // Check conflicts for the updated assignment
    const matchesRaw = await this.prisma.categoryMatch.findMany({
      where: {
        id: { in: assignments.map((a) => a.matchId) },
      },
      include: {
        participants: {
          select: { categoryRegistrationId: true },
        },
      },
    });

    const matchForSchedulingMap = new Map<string, MatchForScheduling>();
    for (const m of matchesRaw) {
      matchForSchedulingMap.set(m.id, {
        id: m.id,
        categoryId: m.categoryId,
        round: m.round,
        matchNumber: m.matchNumber,
        groupId: m.groupId,
        startTime: m.startTime,
        courtId: m.courtId,
        participantIds: m.participants.map((p) => p.categoryRegistrationId),
      });
    }

    const conflicts = this.algorithmService.detectConflicts(
      assignments,
      matchForSchedulingMap
    );

    // Only check conflicts relevant to the updated match
    const relevantConflicts = conflicts.filter((c) => c.matchId === matchId);

    if (relevantConflicts.length > 0) {
      return { success: false, conflicts: relevantConflicts };
    }

    // Save updated assignments
    await this.generatedScheduleModel.update({
      where: { id: scheduleId },
      data: {
        assignments: JSON.stringify(assignments),
      },
    });

    return { success: true };
  }

  /**
   * Save generated schedule to database
   */
  async saveSchedule(
    tournamentId: string,
    scheduleId: string,
    userId: string
  ): Promise<{
    success: boolean;
    scheduledCount: number;
    unscheduledCount: number;
  }> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const generated = await this.generatedScheduleModel.findFirst({
      where: { id: scheduleId, tournamentId },
    });

    if (!generated || generated.expiresAt < new Date()) {
      throw new NotFoundException('Generated schedule not found or expired');
    }

    const assignments = JSON.parse(generated.assignments) as MatchAssignment[];

    // Get total match count
    const totalMatches = await this.prisma.categoryMatch.count({
      where: {
        category: { tournamentId },
        status: MatchStatus.SCHEDULED,
      },
    });

    try {
      // Save all assignments in a single transaction
      await this.prisma.$transaction(
        assignments.map((a) => {
          const startTime = new Date(a.startTime);
          const estimatedEndTime = new Date(a.endTime);

          return this.prisma.categoryMatch.update({
            where: { id: a.matchId },
            data: {
              courtId: a.courtId,
              startTime,
              scheduledDuration: a.duration,
              estimatedEndTime,
              assignedBy: 'SCHEDULE_GENERATOR',
            },
          });
        })
      );

      // Delete the generated schedule
      await this.generatedScheduleModel.delete({
        where: { id: scheduleId },
      });

      return {
        success: true,
        scheduledCount: assignments.length,
        unscheduledCount: totalMatches - assignments.length,
      };
    } catch (error) {
      this.logger.error('Failed to save schedule', error);
      throw new BadRequestException(
        'Failed to save schedule. No changes were made.'
      );
    }
  }

  /**
   * Validate configuration without generating
   */
  async validateConfig(
    tournamentId: string,
    dto: GenerateScheduleDto,
    userId: string
  ): Promise<{ valid: boolean; errors: { field: string; message: string }[] }> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const matchesRaw = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        status: MatchStatus.SCHEDULED,
      },
      select: { round: true },
    });

    const roundTypes = [...new Set(matchesRaw.map((m) => m.round))];
    const errors = this.validationService.validate(dto, roundTypes);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Clean up expired generated schedules
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.generatedScheduleModel.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  private async verifyTournamentOwnership(
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
      throw new BadRequestException('You are not the owner of this tournament');
    }
  }

  /**
   * Auto-generate round-robin matches for groups that have registrations but no matches yet.
   * This ensures the schedule generator includes all categories, not just those
   * where matches were already manually generated.
   */
  private async autoGenerateMissingMatches(tournamentId: string): Promise<void> {
    // Find all groups in this tournament that have registrations
    const groups = await this.prisma.categoryGroup.findMany({
      where: {
        category: { tournamentId },
      },
      include: {
        category: { select: { id: true, matchFormat: true } },
        registrations: {
          select: { categoryRegistrationId: true },
        },
        _count: { select: { matches: true } },
      },
    });

    // Filter to groups with >=2 registrations and 0 existing matches
    const groupsWithoutMatches = groups.filter(
      (g) => g.registrations.length >= 2 && g._count.matches === 0
    );

    if (groupsWithoutMatches.length === 0) return;

    this.logger.log(
      `Auto-generating matches for ${groupsWithoutMatches.length} group(s) in tournament ${tournamentId}`
    );

    for (const group of groupsWithoutMatches) {
      const regIds = group.registrations.map((r) => r.categoryRegistrationId);

      // Generate round-robin pairs
      let matchNumber = 1;
      for (let i = 0; i < regIds.length; i++) {
        for (let j = i + 1; j < regIds.length; j++) {
          await this.prisma.categoryMatch.create({
            data: {
              categoryId: group.categoryId,
              groupId: group.id,
              round: 'GROUP',
              matchNumber: matchNumber++,
              status: MatchStatus.SCHEDULED,
              matchFormat: group.category.matchFormat,
              participants: {
                create: [
                  { categoryRegistrationId: regIds[i], position: 1 },
                  { categoryRegistrationId: regIds[j], position: 2 },
                ],
              },
            },
          });
        }
      }

      this.logger.log(
        `Generated ${matchNumber - 1} match(es) for group ${group.id} in category ${group.categoryId}`
      );
    }
  }
}
