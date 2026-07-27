import { Injectable } from '@nestjs/common';
import { Gender, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardQueryDto } from '../dto';
import {
  resolveDashboardRange,
  toTrendBuckets,
  TrendBucket,
} from '../dashboard-query.util';

export interface UserStatsResponse {
  total: number;
  newInRange: number;
  byRole: { role: Role; count: number }[];
  byGender: { gender: Gender | null; count: number }[];
  trend: TrendBucket[];
}

@Injectable()
export class UserStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(query: DashboardQueryDto): Promise<UserStatsResponse> {
    const { from, to, granularity } = resolveDashboardRange(query);

    const [total, newInRange, byRoleRaw, byGenderRaw, trendRaw] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: { createdAt: { gte: from, lte: to } },
        }),
        this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        this.prisma.user.groupBy({ by: ['gender'], _count: { _all: true } }),
        this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "users"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      ]);

    return {
      total,
      newInRange,
      byRole: byRoleRaw.map((row) => ({
        role: row.role,
        count: row._count._all,
      })),
      byGender: byGenderRaw.map((row) => ({
        gender: row.gender,
        count: row._count._all,
      })),
      trend: toTrendBuckets(trendRaw),
    };
  }
}
