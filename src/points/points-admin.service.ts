import { Injectable } from '@nestjs/common';
import { PointReason, SportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  HOST_MIN_ACTIVE_PLAYERS,
  POINT_VALUES,
  TIER_THRESHOLDS,
} from './points.constants';

/** Read-only view of the scoring system for the admin console. */
@Injectable()
export class PointsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(sport: SportType = 'BADMINTON') {
    const [byReason, byTier, totals, latest, sources] = await Promise.all([
      this.prisma.pointTransaction.groupBy({
        by: ['reason'],
        where: { sport },
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.prisma.userPointsState.groupBy({
        by: ['tier'],
        where: { sport },
        _count: { _all: true },
      }),
      this.prisma.pointTransaction.aggregate({
        where: { sport },
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.prisma.pointTransaction.aggregate({
        where: { sport },
        _max: { occurredAt: true, createdAt: true },
      }),
      this.countSources(),
    ]);

    const rankedUsers = await this.prisma.userPointsState.count({
      where: { sport, totalPoints: { gt: 0 } },
    });

    const reasonCounts = new Map(
      byReason.map((row) => [
        row.reason,
        { count: row._count._all, points: row._sum.points ?? 0 },
      ])
    );
    const tierCounts = new Map(
      byTier.map((row) => [row.tier, row._count._all])
    );

    return {
      config: {
        hostMinActivePlayers: HOST_MIN_ACTIVE_PLAYERS,
        pointValues: (Object.keys(POINT_VALUES) as PointReason[]).map(
          (reason) => ({
            reason,
            points: POINT_VALUES[reason],
            transactions: reasonCounts.get(reason)?.count ?? 0,
            totalPoints: reasonCounts.get(reason)?.points ?? 0,
          })
        ),
        tiers: TIER_THRESHOLDS.map(({ tier, minPoints }) => ({
          tier,
          minPoints,
          users: tierCounts.get(tier) ?? 0,
        })),
      },
      stats: {
        totalTransactions: totals._count._all,
        totalPoints: totals._sum.points ?? 0,
        rankedUsers,
        lastOccurredAt: latest._max.occurredAt,
        lastAwardedAt: latest._max.createdAt,
        ...sources,
      },
    };
  }

  /** How much history exists, so an admin can tell whether a backfill is due. */
  private async countSources() {
    const [finishedSessions, finishedMatches, finishedTournaments] =
      await Promise.all([
        this.prisma.session.count({ where: { status: 'FINISHED' } }),
        this.prisma.match.count({ where: { status: 'FINISHED' } }),
        this.prisma.tournament.count({ where: { status: 'FINISHED' } }),
      ]);
    return { finishedSessions, finishedMatches, finishedTournaments };
  }
}
