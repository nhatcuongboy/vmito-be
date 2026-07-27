import { Injectable } from '@nestjs/common';
import { SessionStatus, SportType, TournamentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardQueryDto } from '../dto';
import {
  resolveDashboardRange,
  toTrendBuckets,
  TrendBucket,
} from '../dashboard-query.util';

export interface SessionTournamentStatsResponse {
  sessions: {
    total: number;
    byStatus: { status: SessionStatus; count: number }[];
    trend: TrendBucket[];
  };
  tournaments: {
    total: number;
    byStatus: { status: TournamentStatus; count: number }[];
    bySportType: { sportType: SportType; count: number }[];
    trend: TrendBucket[];
  };
}

@Injectable()
export class SessionTournamentStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(
    query: DashboardQueryDto
  ): Promise<SessionTournamentStatsResponse> {
    const { from, to, granularity } = resolveDashboardRange(query);

    const [
      sessionsTotal,
      sessionsByStatusRaw,
      sessionsTrendRaw,
      tournamentsTotal,
      tournamentsByStatusRaw,
      tournamentsBySportTypeRaw,
      tournamentsTrendRaw,
    ] = await Promise.all([
      this.prisma.session.count({ where: { isCrawled: false } }),
      this.prisma.session.groupBy({
        by: ['status'],
        where: { isCrawled: false },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "sessions"
        WHERE "isCrawled" = false AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      this.prisma.tournament.count(),
      this.prisma.tournament.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.tournament.groupBy({
        by: ['sportType'],
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "tournaments"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    ]);

    return {
      sessions: {
        total: sessionsTotal,
        byStatus: sessionsByStatusRaw.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        trend: toTrendBuckets(sessionsTrendRaw),
      },
      tournaments: {
        total: tournamentsTotal,
        byStatus: tournamentsByStatusRaw.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        bySportType: tournamentsBySportTypeRaw.map((row) => ({
          sportType: row.sportType,
          count: row._count._all,
        })),
        trend: toTrendBuckets(tournamentsTrendRaw),
      },
    };
  }
}
