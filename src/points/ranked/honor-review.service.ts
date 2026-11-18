import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SportType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { detectDeviceSharing } from '../../host-awards/host-award-fraud';
import { resolvePeriodRange } from '../points.constants';
import {
  RankedLeaderboardService,
  RankedStandingRow,
} from './ranked-leaderboard.service';
import { computeSignals, flagsFor } from './honor-signals';
import { PlayerHonorFlagService } from './player-honor-flag.service';
import { HonorPeriod, RANKED } from './ranked.constants';
import type { HonorEntryDecisionDto } from './dto/ranked.dto';

type Range = { start: Date | null; end: Date | null };

const USER_SELECT = {
  id: true,
  name: true,
  image: true,
  level: true,
  createdAt: true,
} as const;

/**
 * Top-N vetting before an honor list goes public: snapshot the ranked board
 * with fraud signals, let an admin approve/exclude each player, then publish.
 */
@Injectable()
export class HonorReviewService {
  private readonly logger = new Logger(HonorReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankedBoard: RankedLeaderboardService,
    private readonly honorFlag: PlayerHonorFlagService
  ) {}

  /** (Re)builds a DRAFT review. Published reviews are frozen. */
  async generate(
    sport: SportType,
    period: HonorPeriod,
    periodKey: string,
    options: { skipEmpty?: boolean } = {}
  ) {
    const range = resolvePeriodRange(period, periodKey);
    if (!range.key || !range.start)
      throw new BadRequestException('Kỳ không hợp lệ');

    const existing = await this.prisma.honorReview.findUnique({
      where: {
        sport_period_periodKey: { sport, period, periodKey: range.key },
      },
    });
    if (existing?.status === 'PUBLISHED') {
      throw new BadRequestException('Danh sách vinh danh kỳ này đã công bố');
    }

    const top = await this.rankedBoard.standings(
      { sport, start: range.start, end: range.end },
      { limit: RANKED.honorTopN, offset: 0 }
    );
    if (top.length === 0 && options.skipEmpty) return null;
    const entries: Prisma.HonorReviewEntryCreateWithoutReviewInput[] = [];
    for (const [index, row] of top.entries()) {
      const signals = await this.signalsFor(row, sport, range);
      entries.push({
        user: { connect: { id: row.userId } },
        rank: index + 1,
        points: row.points,
        matches: row.matches,
        opponents: row.opponents,
        signals: signals as unknown as Prisma.InputJsonValue,
        flags: flagsFor(signals),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (existing) await tx.honorReview.delete({ where: { id: existing.id } });
      return tx.honorReview.create({
        data: {
          sport,
          period,
          periodKey: range.key!,
          entries: { create: entries },
        },
        include: { entries: { orderBy: { rank: 'asc' } } },
      });
    });
  }

  /** Creates DRAFTs for periods that just ended and have none yet. */
  async generateMissing(
    sport: SportType,
    period: HonorPeriod,
    periodKey: string
  ) {
    const exists = await this.prisma.honorReview.findUnique({
      where: { sport_period_periodKey: { sport, period, periodKey } },
      select: { id: true },
    });
    if (exists) return null;
    return this.generate(sport, period, periodKey, { skipEmpty: true });
  }

  list(page = 1, limit = 20) {
    return this.prisma.honorReview.findMany({
      orderBy: [{ generatedAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { entries: true } } },
    });
  }

  async get(id: string) {
    const review = await this.prisma.honorReview.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { rank: 'asc' },
          include: { user: { select: USER_SELECT } },
        },
      },
    });
    if (!review) throw new NotFoundException('Honor review not found');
    return review;
  }

  async decide(
    reviewId: string,
    entryId: string,
    dto: HonorEntryDecisionDto,
    adminId: string
  ) {
    const entry = await this.prisma.honorReviewEntry.findFirst({
      where: { id: entryId, reviewId },
      include: { review: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.review.status === 'PUBLISHED') {
      throw new BadRequestException('Danh sách đã công bố, không sửa được');
    }
    return this.prisma.honorReviewEntry.update({
      where: { id: entryId },
      data: {
        decision: dto.decision,
        note: dto.note ?? null,
        decidedById: adminId,
        decidedAt: new Date(),
      },
    });
  }

  async publish(id: string, adminId: string) {
    const review = await this.get(id);
    if (review.status === 'PUBLISHED') return review;
    if (review.entries.some((e) => e.decision === 'PENDING')) {
      throw new BadRequestException('Còn người chơi chưa được duyệt');
    }
    let publicRank = 0;
    await this.prisma.$transaction([
      ...review.entries.map((e) =>
        this.prisma.honorReviewEntry.update({
          where: { id: e.id },
          data: { publicRank: e.decision === 'APPROVED' ? ++publicRank : null },
        })
      ),
      this.prisma.honorReview.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: adminId,
        },
      }),
    ]);
    this.logger.log(`Honor review ${id} published with ${publicRank} players`);
    return this.get(id);
  }

  async getPublished(query: {
    sport?: SportType;
    period: HonorPeriod;
    periodKey: string;
  }) {
    const sport = query.sport ?? 'BADMINTON';
    const unpublished = {
      sport,
      period: query.period,
      periodKey: query.periodKey,
      published: false,
      entries: [],
    };
    if (!(await this.honorFlag.isEnabled())) {
      return { ...unpublished, enabled: false };
    }
    const review = await this.prisma.honorReview.findUnique({
      where: {
        sport_period_periodKey: {
          sport,
          period: query.period,
          periodKey: query.periodKey,
        },
      },
      include: {
        entries: {
          where: { decision: 'APPROVED' },
          orderBy: { publicRank: 'asc' },
          include: {
            user: {
              select: { id: true, name: true, image: true, level: true },
            },
          },
        },
      },
    });
    if (!review || review.status !== 'PUBLISHED') {
      return { ...unpublished, enabled: true };
    }
    return {
      enabled: true,
      sport,
      period: query.period,
      periodKey: query.periodKey,
      published: true,
      publishedAt: review.publishedAt,
      entries: review.entries.map((e) => ({
        rank: e.publicRank,
        points: e.points,
        matchesPlayed: e.matches,
        matchesWon: honorWins(e.signals),
        distinctOpponents: e.opponents,
        user: e.user,
      })),
    };
  }

  // ---------------------------------------------------------------------------

  private async signalsFor(
    row: RankedStandingRow,
    sport: SportType,
    range: Range
  ) {
    const occurredAt = {
      ...(range.start ? { gte: range.start } : {}),
      ...(range.end ? { lt: range.end } : {}),
    };
    const rows = await this.prisma.rankedPointTransaction.findMany({
      where: { userId: row.userId, sport, occurredAt },
      select: {
        reason: true,
        points: true,
        opponentUserIds: true,
        matchMinutes: true,
        guestOpponents: true,
        sessionHostId: true,
        occurredAt: true,
      },
    });
    const opponentIds = [...new Set(rows.flatMap((r) => r.opponentUserIds))];

    const [opponents, devices, playedMatches] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: opponentIds } },
        select: { id: true, createdAt: true },
      }),
      this.prisma.notificationDevice.findMany({
        where: {
          userId: { in: [row.userId, ...opponentIds] },
          deviceId: { not: null },
        },
        select: { userId: true, deviceId: true },
      }),
      this.prisma.match.findMany({
        where: {
          players: { some: { player: { userId: row.userId } } },
          rankedStatus: { not: null },
          endTime: occurredAt,
          session: { sportType: sport },
        },
        select: {
          rankedStatus: true,
          rankedDisputeReason: true,
          rankedDisputedById: true,
        },
      }),
    ]);

    const deviceIdsByUser = new Map<string, string[]>();
    for (const d of devices) {
      if (!d.deviceId) continue;
      deviceIdsByUser.set(d.userId, [
        ...(deviceIdsByUser.get(d.userId) ?? []),
        d.deviceId,
      ]);
    }
    const sharing = detectDeviceSharing(
      row.userId,
      opponentIds,
      deviceIdsByUser
    );
    // Someone else said this player was never in the match.
    const notParticipatedReports = playedMatches.filter(
      (m) =>
        m.rankedDisputeReason === 'NOT_PARTICIPATED' &&
        m.rankedDisputedById !== row.userId
    ).length;

    return computeSignals(rows, {
      opponentCreatedAt: new Map(opponents.map((o) => [o.id, o.createdAt])),
      sharedDeviceOpponents: sharing.sharedWithHost,
      disputedOrRejected: playedMatches.filter(
        (m) => m.rankedStatus === 'DISPUTED' || m.rankedStatus === 'REJECTED'
      ).length,
      notParticipatedReports,
    });
  }
}

/** Wins from the signals snapshot taken when the review was generated. */
function honorWins(signals: Prisma.JsonValue): number {
  if (signals && typeof signals === 'object' && !Array.isArray(signals)) {
    const wins = (signals as Record<string, unknown>).wins;
    if (typeof wins === 'number') return wins;
  }
  return 0;
}
