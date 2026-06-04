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
  byRound: {
    round: string;
    scheduled: number;
    total: number;
    byGroup?: {
      groupId: string;
      groupName: string;
      scheduled: number;
      total: number;
    }[];
  }[];
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

    // Note: incomplete team rosters are allowed here so organizers can build
    // the schedule early. Roster completeness is enforced at play time
    // (starting/ending a match) and before publishing the tournament.

    // Auto-generate matches for categories/groups that have registrations but no matches
    await this.autoGenerateMissingMatches(tournamentId);

    // Fetch all matches with participants
    const matchesRawAll = await this.prisma.categoryMatch.findMany({
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

    // Group matches need both participants. Elimination matches are scheduled
    // even as placeholder shells (0 participants) so the whole bracket can be
    // laid out in advance; the UI shows seed/feeder labels ("Nhất Bảng A",
    // "Thắng trận N") for the empty slots.
    const matchesRaw = matchesRawAll.filter(
      (m) =>
        m.participants.length >= 2 ||
        (m.round !== 'GROUP' && m.groupId === null)
    );
    const skippedPlaceholderCount = matchesRawAll.length - matchesRaw.length;
    if (skippedPlaceholderCount > 0) {
      this.logger.log(
        `Skipped ${skippedPlaceholderCount} incomplete group match(es) without participants in tournament ${tournamentId}`
      );
    }

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
    interface RoundData {
      scheduled: number;
      total: number;
      groups: Map<string, { name: string; scheduled: number; total: number }>;
    }
    const categoryMap = new Map<
      string,
      {
        name: string;
        rounds: Map<string, RoundData>;
      }
    >();

    const getOrCreateRound = (
      catId: string,
      round: string,
      catName: string
    ): RoundData => {
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, { name: catName, rounds: new Map() });
      }
      const cat = categoryMap.get(catId)!;
      if (!cat.rounds.has(round)) {
        cat.rounds.set(round, { scheduled: 0, total: 0, groups: new Map() });
      }
      return cat.rounds.get(round)!;
    };

    for (const m of matchesRaw) {
      const roundData = getOrCreateRound(
        m.categoryId,
        m.round,
        m.category.name
      );
      roundData.total++;

      // Track per-group counts
      if (m.groupId && m.group) {
        if (!roundData.groups.has(m.groupId)) {
          roundData.groups.set(m.groupId, {
            name: m.group.name || `Pool ${roundData.groups.size + 1}`,
            scheduled: 0,
            total: 0,
          });
        }
        roundData.groups.get(m.groupId)!.total++;
      }
    }

    // Mark scheduled from new assignments
    const assignedSet = new Set(result.assignments.map((a) => a.matchId));
    for (const assignment of result.assignments) {
      const m = matchesRaw.find((match) => match.id === assignment.matchId);
      if (m) {
        const roundData = categoryMap.get(m.categoryId)?.rounds.get(m.round);
        if (roundData) {
          roundData.scheduled++;
          if (m.groupId && roundData.groups.has(m.groupId)) {
            roundData.groups.get(m.groupId)!.scheduled++;
          }
        }
      }
    }

    // Also count already-scheduled matches if keepScheduledMatches
    if (dto.keepScheduledMatches) {
      const alreadyScheduled = matchesRaw.filter(
        (m) => m.startTime && m.courtId && !assignedSet.has(m.id)
      );
      for (const m of alreadyScheduled) {
        const cat = categoryMap.get(m.categoryId);
        if (cat) {
          const roundData = cat.rounds.get(m.round);
          if (roundData) {
            roundData.scheduled++;
            if (m.groupId && roundData.groups.has(m.groupId)) {
              roundData.groups.get(m.groupId)!.scheduled++;
            }
          }
        }
      }
    }

    const byCategory: ScheduleSummaryCategory[] = [];
    for (const [categoryId, cat] of categoryMap) {
      const byRound: ScheduleSummaryCategory['byRound'] = [];
      let catScheduled = 0;
      let catTotal = 0;
      for (const [round, data] of cat.rounds) {
        const byGroup =
          data.groups.size > 0
            ? Array.from(data.groups.entries()).map(([groupId, g]) => ({
                groupId,
                groupName: g.name,
                scheduled: g.scheduled,
                total: g.total,
              }))
            : undefined;
        byRound.push({
          round,
          scheduled: data.scheduled,
          total: data.total,
          byGroup,
        });
        catScheduled += data.scheduled;
        catTotal += data.total;
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
   * Clear scheduling info (courtId, startTime, scheduledDuration, estimatedEndTime)
   * for every match in the tournament. Does not delete matches themselves.
   */
  async clearSchedule(
    tournamentId: string,
    userId: string
  ): Promise<{ success: boolean; clearedCount: number }> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const result = await this.prisma.categoryMatch.updateMany({
      where: {
        category: { tournamentId },
        OR: [
          { courtId: { not: null } },
          { startTime: { not: null } },
          { estimatedEndTime: { not: null } },
          { scheduledDuration: { not: null } },
        ],
      },
      data: {
        courtId: null,
        startTime: null,
        estimatedEndTime: null,
        scheduledDuration: null,
        assignedBy: null,
      },
    });

    return { success: true, clearedCount: result.count };
  }

  /**
   * Delete all matches in the tournament that have NOT been scheduled yet
   * (status = SCHEDULED and no courtId / startTime assigned). Safety guard:
   * matches that are IN_PROGRESS or FINISHED are never deleted. Matches that
   * are scheduled (have court+time) are also preserved.
   */
  async deleteUnscheduledMatches(
    tournamentId: string,
    userId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const result = await this.prisma.categoryMatch.deleteMany({
      where: {
        category: { tournamentId },
        status: 'SCHEDULED',
        courtId: null,
        startTime: null,
      },
    });

    return { success: true, deletedCount: result.count };
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
          // Calculate estimatedEndTime from startTime + duration (in minutes)
          const estimatedEndTime = new Date(
            startTime.getTime() + a.duration * 60000
          );

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
   *
   * Also handles two additional setup gaps that would otherwise hide a category
   * from the generated schedule:
   *   1. Group-stage categories that have registrations but no groups yet → create
   *      default groups (using category.groupCount, falling back to 1).
   *   2. Group-stage categories whose groups exist but have no registrations
   *      assigned → bulk auto-assign all category registrations using a simple
   *      round-robin distribution.
   */
  private async autoGenerateMissingMatches(
    tournamentId: string
  ): Promise<void> {
    // Step 1: Ensure group-stage categories have groups with assigned registrations.
    await this.ensureGroupsForCategories(tournamentId);

    // Step 2: Generate round-robin matches for every group that still has none.
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

  /**
   * For every group-stage category in the tournament, make sure that:
   *   - At least one group exists (creates default groups if none).
   *   - Every registration is assigned to a group (round-robin distribution).
   *
   * Categories with format SINGLE_ELIMINATION (hasGroupStage === false) are
   * skipped here; their bracket is generated through the dedicated
   * completeGroupStage / generateEliminationBracket flow.
   */
  private async ensureGroupsForCategories(tournamentId: string): Promise<void> {
    const categories = await this.prisma.category.findMany({
      where: { tournamentId, hasGroupStage: true },
      include: {
        registrations: { select: { id: true } },
        groups: {
          orderBy: { groupNumber: 'asc' },
          include: {
            registrations: { select: { categoryRegistrationId: true } },
          },
        },
      },
    });

    const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (const category of categories) {
      if (category.registrations.length === 0) continue;

      // 1) Create groups if none exist yet.
      let groups = category.groups;
      if (groups.length === 0) {
        const desiredCount = Math.max(1, category.groupCount ?? 1);
        const data = Array.from({ length: desiredCount }, (_, i) => ({
          categoryId: category.id,
          groupNumber: i + 1,
          name: `Group ${groupNames[i] || i + 1}`,
        }));
        await this.prisma.categoryGroup.createMany({ data });
        groups = await this.prisma.categoryGroup.findMany({
          where: { categoryId: category.id },
          orderBy: { groupNumber: 'asc' },
          include: {
            registrations: { select: { categoryRegistrationId: true } },
          },
        });
        this.logger.log(
          `Auto-created ${desiredCount} group(s) for category ${category.id}`
        );
      }

      // 2) Auto-assign registrations that are not in any group of this category.
      const assignedIds = new Set<string>();
      for (const g of groups) {
        for (const r of g.registrations) {
          assignedIds.add(r.categoryRegistrationId);
        }
      }
      const unassigned = category.registrations
        .map((r) => r.id)
        .filter((id) => !assignedIds.has(id));
      if (unassigned.length === 0) continue;

      // Distribute round-robin into the group with the fewest current
      // registrations to keep group sizes balanced.
      const groupCounts = groups.map((g) => ({
        id: g.id,
        count: g.registrations.length,
      }));
      const assignments: { categoryRegistrationId: string; groupId: string }[] =
        [];
      for (const regId of unassigned) {
        groupCounts.sort((a, b) => a.count - b.count);
        const target = groupCounts[0];
        assignments.push({
          categoryRegistrationId: regId,
          groupId: target.id,
        });
        target.count++;
      }

      await this.prisma.categoryGroupRegistration.createMany({
        data: assignments,
        skipDuplicates: true,
      });
      this.logger.log(
        `Auto-assigned ${assignments.length} registration(s) to groups for category ${category.id}`
      );
    }
  }
}
