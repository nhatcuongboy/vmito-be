import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RankedResultStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RankedPointsService } from './ranked-points.service';
import { PlayerHonorFlagService } from './player-honor-flag.service';
import {
  EligibilityResult,
  evaluateEligibility,
  isLateEdit,
} from './ranked-eligibility';
import type { DisputeResultDto } from './dto/ranked.dto';

const MATCH_INCLUDE = {
  session: {
    select: {
      sportType: true,
      isCrawled: true,
      hostId: true,
      managers: { select: { userId: true } },
    },
  },
  players: {
    select: { playerId: true, player: { select: { userId: true } } },
  },
} as const;

/**
 * Verified-ranking lifecycle of a casual match. A recorded result counts at
 * once (VERIFIED); a player may dispute it and an admin settles disputes or
 * rejects suspicious matches. Activity points (PointsService) are untouched.
 */
@Injectable()
export class RankedMatchService {
  private readonly logger = new Logger(RankedMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankedPoints: RankedPointsService,
    private readonly honorFlag: PlayerHonorFlagService
  ) {}

  /** A court match just ended. Best-effort: never throws. */
  async onMatchEnded(matchId: string, submittedById?: string): Promise<void> {
    try {
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          resultSubmittedById: submittedById ?? null,
        },
      });
      await this.evaluateAndAward(matchId);
    } catch (error) {
      this.logSwallowed('onMatchEnded', matchId, error);
    }
  }

  /**
   * A result was edited. Admin rejections and open disputes stand (an edit
   * must not undo them); otherwise the match is re-evaluated.
   */
  async onMatchEdited(matchId: string, editorId?: string): Promise<void> {
    try {
      const match = await this.prisma.match.update({
        where: { id: matchId },
        data: {
          resultSubmittedById: editorId ?? null,
        },
      });
      if (
        match.rankedStatus === 'REJECTED' ||
        match.rankedStatus === 'DISPUTED'
      ) {
        await this.rankedPoints.removeMatch(matchId);
        return;
      }
      if (isLateEdit(match.endTime, new Date())) {
        await this.rankedPoints.removeMatch(matchId);
        await this.setStatus(matchId, 'INELIGIBLE', 'EDITED_LATE');
        return;
      }
      await this.evaluateAndAward(matchId);
    } catch (error) {
      this.logSwallowed('onMatchEdited', matchId, error);
    }
  }

  /** The match row is gone; drop its ranked rows. */
  async onMatchDeleted(matchId: string): Promise<void> {
    try {
      await this.rankedPoints.removeMatch(matchId);
    } catch (error) {
      this.logSwallowed('onMatchDeleted', matchId, error);
    }
  }

  /** A player of the match objects; its points are held until an admin decides. */
  async dispute(userId: string, matchId: string, dto: DisputeResultDto) {
    await this.honorFlag.assertEnabled();
    const { match } = await this.load(matchId);
    if (!match.players.some((mp) => mp.player.userId === userId)) {
      throw new ForbiddenException('Bạn không có trong trận này');
    }
    if (
      match.rankedStatus !== 'VERIFIED' &&
      match.rankedStatus !== 'DISPUTED'
    ) {
      throw new BadRequestException('Trận này không tính điểm xếp hạng');
    }
    if (match.rankedReviewedById) {
      throw new BadRequestException('Admin đã xem xét trận này');
    }
    // The latest dispute wins: a match has 2-4 players and an admin only
    // needs to know it is contested and why.
    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        rankedDisputeReason: dto.reason,
        rankedDisputeNote: dto.note ?? null,
        rankedDisputedById: userId,
      },
    });
    await this.rankedPoints.removeMatch(matchId);
    await this.setStatus(matchId, 'DISPUTED');
    return this.statusOf(matchId);
  }

  /** Admin review: count the match (again) or throw it out. */
  async adminReview(
    matchId: string,
    status: 'VERIFIED' | 'REJECTED',
    adminId: string,
    note?: string
  ) {
    const { match, result } = await this.load(matchId);
    if (!match.rankedStatus) {
      throw new BadRequestException('Trận chưa thuộc hệ thống xếp hạng');
    }
    if (status === 'VERIFIED') {
      if (!result.eligible) {
        throw new BadRequestException(
          `Trận không đủ điều kiện: ${result.reason}`
        );
      }
      await this.award(match, result);
    } else {
      await this.rankedPoints.removeMatch(matchId);
    }
    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        rankedStatus: status,
        rankedIneligibleReason: null,
        rankedResolvedAt: new Date(),
        rankedReviewedById: adminId,
        rankedReviewNote: note ?? null,
      },
    });
    return this.statusOf(matchId);
  }

  // ---------------------------------------------------------------------------

  private async evaluateAndAward(matchId: string): Promise<void> {
    const { match, result } = await this.load(matchId);
    if (!result.eligible) {
      await this.rankedPoints.removeMatch(matchId);
      await this.setStatus(matchId, 'INELIGIBLE', result.reason);
      return;
    }
    await this.award(match, result);
    await this.setStatus(matchId, 'VERIFIED');
  }

  private async award(
    match: Awaited<ReturnType<typeof this.load>>['match'],
    result: Extract<EligibilityResult, { eligible: true }>
  ) {
    await this.rankedPoints.awardMatch({
      matchId: match.id,
      sport: match.session.sportType,
      occurredAt: match.endTime ?? new Date(),
      matchMinutes: result.matchMinutes,
      sessionHostId: match.session.hostId,
      sides: result.sides,
    });
  }

  private async load(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    if (!match) throw new NotFoundException('Match not found');
    const { session } = match;
    const result = evaluateEligibility({
      status: match.status,
      startTime: match.startTime,
      endTime: match.endTime,
      winnerIds: match.winnerIds,
      isDraw: match.isDraw,
      isCrawledSession: session.isCrawled,
      players: match.players.map((mp) => ({
        playerId: mp.playerId,
        userId: mp.player.userId,
      })),
      organizerUserIds: [
        ...(session.hostId ? [session.hostId] : []),
        ...session.managers.map((m) => m.userId),
      ],
    });
    return { match, result };
  }

  private async setStatus(
    matchId: string,
    status: RankedResultStatus,
    reason?: string
  ) {
    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        rankedStatus: status,
        rankedIneligibleReason: reason ?? null,
        rankedResolvedAt: new Date(),
      },
    });
  }

  private statusOf(matchId: string) {
    return this.prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        id: true,
        rankedStatus: true,
        rankedIneligibleReason: true,
        rankedResolvedAt: true,
      },
    });
  }

  private logSwallowed(op: string, ref: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${op} failed for ${ref}: ${message}`);
  }
}
