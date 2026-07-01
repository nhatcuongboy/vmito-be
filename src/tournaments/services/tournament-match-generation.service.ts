import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus, TournamentCourtStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ScheduleBlockingReason =
  | 'MATCHES_NOT_GENERATED'
  | 'NO_SCHEDULABLE_MATCHES';

interface ScheduleReadinessCategory {
  categoryId: string;
  categoryName: string;
}

interface ScheduleReadiness {
  totalMatches: number;
  schedulableMatches: number;
  scheduledMatches: number;
  unscheduledMatches: number;
  inProgressMatches: number;
  finishedMatches: number;
  categoriesWithoutMatches: ScheduleReadinessCategory[];
  canGenerateSchedule: boolean;
  blockingReason?: ScheduleBlockingReason;
}

@Injectable()
export class TournamentMatchGenerationService {
  constructor(private prisma: PrismaService) {}

  async getScheduleReadiness(
    tournamentId: string,
    userId: string
  ): Promise<ScheduleReadiness> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const [matches, categories] = await Promise.all([
      this.prisma.categoryMatch.findMany({
        where: { category: { tournamentId } },
        select: {
          status: true,
          courtId: true,
          startTime: true,
          round: true,
          groupId: true,
          participants: { select: { id: true } },
        },
      }),
      this.prisma.category.findMany({
        where: { tournamentId },
        select: {
          id: true,
          name: true,
          _count: { select: { matches: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const schedulable = matches.filter(
      (match) =>
        match.status === MatchStatus.SCHEDULED &&
        (match.participants.length >= 2 ||
          (match.round !== 'GROUP' && match.groupId === null))
    );
    const assignedSchedule = schedulable.filter(
      (match) => match.courtId !== null && match.startTime !== null
    );
    const categoriesWithoutMatches = categories
      .filter((category) => category._count.matches === 0)
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
      }));
    const totalMatches = matches.length;
    const schedulableMatches = schedulable.length;
    const blockingReason =
      totalMatches === 0
        ? 'MATCHES_NOT_GENERATED'
        : schedulableMatches === 0
          ? 'NO_SCHEDULABLE_MATCHES'
          : undefined;

    return {
      totalMatches,
      schedulableMatches,
      scheduledMatches: assignedSchedule.length,
      unscheduledMatches: schedulableMatches - assignedSchedule.length,
      inProgressMatches: matches.filter(
        (match) => match.status === MatchStatus.IN_PROGRESS
      ).length,
      finishedMatches: matches.filter(
        (match) => match.status === MatchStatus.FINISHED
      ).length,
      categoriesWithoutMatches,
      canGenerateSchedule: blockingReason === undefined,
      blockingReason,
    };
  }

  async deleteAllTournamentMatches(
    tournamentId: string,
    userId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    await this.verifyTournamentOwnership(tournamentId, userId);

    const [, , result] = await this.prisma.$transaction([
      this.prisma.tournamentCourt.updateMany({
        where: {
          tournamentId,
          currentMatch: { is: { category: { tournamentId } } },
          status: TournamentCourtStatus.OCCUPIED,
        },
        data: {
          currentMatchId: null,
          status: TournamentCourtStatus.AVAILABLE,
        },
      }),
      this.prisma.tournamentCourt.updateMany({
        where: {
          tournamentId,
          currentMatch: { is: { category: { tournamentId } } },
        },
        data: { currentMatchId: null },
      }),
      this.prisma.categoryMatch.deleteMany({
        where: {
          category: { tournamentId },
        },
      }),
    ]);

    return { success: true, deletedCount: result.count };
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
}
