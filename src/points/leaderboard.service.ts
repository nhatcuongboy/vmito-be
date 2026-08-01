import { Injectable } from '@nestjs/common';
import { PointReason, Prisma, SportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  LeaderboardPeriod,
  nextTierInfo,
  periodStart,
  PointsBoard,
  reasonsForBoard,
  resolvePeriodRange,
  tierForPoints,
} from './points.constants';

const WIN_REASONS: PointReason[] = [
  'SESSION_MATCH_WIN',
  'TOURNAMENT_MATCH_WIN',
];
const DRAW_REASONS: PointReason[] = [
  'SESSION_MATCH_DRAW',
  'TOURNAMENT_MATCH_DRAW',
];
const LOSS_REASONS: PointReason[] = [
  'SESSION_MATCH_LOSS',
  'TOURNAMENT_MATCH_LOSS',
];
const MATCH_REASONS = [...WIN_REASONS, ...DRAW_REASONS, ...LOSS_REASONS];

const PERIODS: LeaderboardPeriod[] = ['week', 'month', 'year', 'all'];

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(params: {
    sport?: SportType;
    period?: LeaderboardPeriod;
    periodKey?: string;
    board?: PointsBoard;
    page?: number;
    limit?: number;
  }) {
    const sport = params.sport ?? 'BADMINTON';
    const period = params.period ?? 'all';
    const board = params.board ?? 'player';
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const range = resolvePeriodRange(period, params.periodKey);

    const where: Prisma.PointTransactionWhereInput = {
      sport,
      reason: { in: reasonsForBoard(board) },
      ...(range.start
        ? { occurredAt: { gte: range.start, lt: range.end ?? undefined } }
        : {}),
    };

    const [rows, allUsers] = await Promise.all([
      this.prisma.pointTransaction.groupBy({
        by: ['userId'],
        where,
        _sum: { points: true },
        orderBy: [{ _sum: { points: 'desc' } }, { userId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pointTransaction.groupBy({
        by: ['userId'],
        where,
        _count: true,
      }),
    ]);

    const userIds = rows.map((r) => r.userId);
    const [users, states, matchStats] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true, level: true },
      }),
      this.prisma.userPointsState.findMany({
        where: { sport, userId: { in: userIds } },
      }),
      this.prisma.pointTransaction.groupBy({
        by: ['userId', 'reason'],
        where: {
          ...where,
          userId: { in: userIds },
          reason: { in: MATCH_REASONS },
        },
        _count: true,
      }),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const stateByUser = new Map(states.map((s) => [s.userId, s]));
    const countFor = (userId: string, reasons: PointReason[]) =>
      matchStats
        .filter((s) => s.userId === userId && reasons.includes(s.reason))
        .reduce((sum, s) => sum + s._count, 0);

    return {
      sport,
      period,
      board,
      periodKey: range.key,
      periodStart: range.start,
      periodEnd: range.end,
      isCurrentPeriod: range.isCurrent,
      page,
      limit,
      total: allUsers.length,
      totalPages: Math.ceil(allUsers.length / limit) || 1,
      entries: rows.map((row, index) => {
        const user = userById.get(row.userId);
        const state = stateByUser.get(row.userId);
        return {
          rank: (page - 1) * limit + index + 1,
          points: row._sum.points ?? 0,
          user: {
            id: row.userId,
            name: user?.name ?? 'Unknown',
            image: user?.image ?? null,
            level: user?.level ?? null,
          },
          tier: state?.tier ?? 'BRONZE',
          // All-time total on this board, so the client can explain why the
          // tier badge does not track the period points shown next to it.
          totalPoints:
            (board === 'host' ? state?.hostPoints : state?.totalPoints) ?? 0,
          matchesWon: countFor(row.userId, WIN_REASONS),
          matchesPlayed: countFor(row.userId, MATCH_REASONS),
        };
      }),
    };
  }

  async getUserRank(
    userId: string,
    sport: SportType,
    period: LeaderboardPeriod,
    board: PointsBoard = 'player'
  ) {
    const start = periodStart(period);
    const reasons = reasonsForBoard(board);
    const agg = await this.prisma.pointTransaction.aggregate({
      where: {
        userId,
        sport,
        reason: { in: reasons },
        ...(start ? { occurredAt: { gte: start } } : {}),
      },
      _sum: { points: true },
      _count: true,
    });
    const points = agg._sum.points ?? 0;
    if (agg._count === 0) return { period, points: 0, rank: null };

    const reasonList = Prisma.join(
      reasons.map((reason) => Prisma.sql`${reason}::"PointReason"`)
    );
    const higher = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "userId" FROM "point_transactions"
        WHERE "sport" = ${sport}::"SportType"
        AND "reason" IN (${reasonList})
        ${start ? Prisma.sql`AND "occurredAt" >= ${start}` : Prisma.empty}
        GROUP BY "userId"
        HAVING SUM("points") > ${points}
      ) ranked
    `);
    return { period, points, rank: Number(higher[0]?.count ?? 0) + 1 };
  }

  async getMyRanks(userId: string, sport?: SportType) {
    const s = sport ?? 'BADMINTON';
    const ranks = await Promise.all(
      PERIODS.map((p) => this.getUserRank(userId, s, p))
    );
    return { sport: s, ranks };
  }

  async getUserAchievements(userId: string, sport?: SportType) {
    const s = sport ?? 'BADMINTON';
    const [state, reasonStats, ranks, recentTransactions] = await Promise.all([
      this.prisma.userPointsState.findUnique({
        where: { userId_sport: { userId, sport: s } },
      }),
      this.prisma.pointTransaction.groupBy({
        by: ['reason'],
        where: { userId, sport: s },
        _count: true,
        _sum: { points: true },
      }),
      Promise.all(PERIODS.map((p) => this.getUserRank(userId, s, p))),
      this.prisma.pointTransaction.findMany({
        where: { userId, sport: s },
        orderBy: { occurredAt: 'desc' },
        take: 20,
        select: {
          id: true,
          points: true,
          reason: true,
          refType: true,
          refId: true,
          occurredAt: true,
        },
      }),
    ]);

    const totalPoints = state?.totalPoints ?? 0;
    const countFor = (reasons: PointReason[]) =>
      reasonStats
        .filter((r) => reasons.includes(r.reason))
        .reduce((sum, r) => sum + r._count, 0);

    return {
      sport: s,
      totalPoints,
      // Hosting is ranked on its own board; surfaced here for future host UI.
      hostPoints: state?.hostPoints ?? 0,
      tier: state?.tier ?? tierForPoints(totalPoints),
      nextTier: nextTierInfo(totalPoints),
      ranks,
      stats: {
        wins: countFor(WIN_REASONS),
        draws: countFor(DRAW_REASONS),
        losses: countFor(LOSS_REASONS),
        matchesPlayed: countFor(MATCH_REASONS),
        sessionsPlayed: countFor(['SESSION_PARTICIPATION']),
        sessionsHosted: countFor(['SESSION_HOSTED']),
        tournamentTitles: countFor(['TOURNAMENT_CHAMPION']),
        tournamentRunnerUps: countFor(['TOURNAMENT_RUNNER_UP']),
      },
      recentTransactions,
    };
  }
}
