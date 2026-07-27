import { Injectable } from '@nestjs/common';
import { ClubStatus, VenueRequestStatus, VenueStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardQueryDto } from '../dto';
import {
  resolveDashboardRange,
  toTrendBuckets,
  TrendBucket,
} from '../dashboard-query.util';

export interface ClubVenueStatsResponse {
  clubs: {
    total: number;
    byStatus: { status: ClubStatus; count: number }[];
    trend: TrendBucket[];
  };
  venues: {
    total: number;
    byStatus: { status: VenueStatus; count: number }[];
    trend: TrendBucket[];
    pendingRequests: number;
    requestsByStatus: { status: VenueRequestStatus; count: number }[];
  };
}

@Injectable()
export class ClubVenueStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(query: DashboardQueryDto): Promise<ClubVenueStatsResponse> {
    const { from, to, granularity } = resolveDashboardRange(query);

    const [
      clubsTotal,
      clubsByStatusRaw,
      clubsTrendRaw,
      venuesTotal,
      venuesByStatusRaw,
      venuesTrendRaw,
      pendingRequests,
      requestsByStatusRaw,
    ] = await Promise.all([
      this.prisma.club.count(),
      this.prisma.club.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "clubs"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      this.prisma.venue.count(),
      this.prisma.venue.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "venues"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      this.prisma.venueRequest.count({
        where: { status: VenueRequestStatus.PENDING },
      }),
      this.prisma.venueRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      clubs: {
        total: clubsTotal,
        byStatus: clubsByStatusRaw.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        trend: toTrendBuckets(clubsTrendRaw),
      },
      venues: {
        total: venuesTotal,
        byStatus: venuesByStatusRaw.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        trend: toTrendBuckets(venuesTrendRaw),
        pendingRequests,
        requestsByStatus: requestsByStatusRaw.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
      },
    };
  }
}
