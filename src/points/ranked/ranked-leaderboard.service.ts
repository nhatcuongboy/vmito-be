import { Injectable } from '@nestjs/common';
import { Prisma, SportType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaderboardPeriod, resolvePeriodRange } from '../points.constants';
import { HONOR_PERIODS, RANKED } from './ranked.constants';
import { PlayerHonorFlagService } from './player-honor-flag.service';

export interface RankedStandingRow {
  userId: string;
  points: number;
  matches: number;
  wins: number;
  opponents: number;
}

const REQUIREMENTS = {
  minVerifiedMatches: RANKED.minVerifiedMatches,
  minDistinctOpponents: RANKED.minDistinctOpponents,
};

interface RangeParams {
  sport: SportType;
  start: Date | null;
  end: Date | null;
}

/**
 * Verified (honor) board: sums `ranked_point_transactions` for a period and
 * only lists players with enough verified matches against enough different
 * opponents. Admins keep cheaters off by rejecting their matches and by
 * excluding them in the honor review.
 */
@Injectable()
export class RankedLeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly honorFlag: PlayerHonorFlagService
  ) {}

  async getLeaderboard(params: {
    sport?: SportType;
    period?: LeaderboardPeriod;
    periodKey?: string;
    page?: number;
    limit?: number;
  }) {
    const sport = params.sport ?? 'BADMINTON';
    const period = params.period ?? 'month';
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const range = resolvePeriodRange(period, params.periodKey);
    const scope = { sport, start: range.start, end: range.end };
    const header = {
      enabled: true,
      sport,
      period,
      board: 'ranked' as const,
      periodKey: range.key,
      periodStart: range.start,
      periodEnd: range.end,
      isCurrentPeriod: range.isCurrent,
      requirements: REQUIREMENTS,
      page,
      limit,
    };
    if (!(await this.honorFlag.isEnabled())) {
      return {
        ...header,
        enabled: false,
        total: 0,
        totalPages: 1,
        entries: [],
      };
    }

    const [rows, total] = await Promise.all([
      this.standings(scope, { limit, offset: (page - 1) * limit }),
      this.countEligible(scope),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, name: true, image: true, level: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      ...header,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      entries: rows.map((row, index) => {
        const user = userById.get(row.userId);
        return {
          rank: (page - 1) * limit + index + 1,
          points: row.points,
          user: {
            id: row.userId,
            name: user?.name ?? 'Unknown',
            image: user?.image ?? null,
            level: user?.level ?? null,
          },
          matchesWon: row.wins,
          matchesPlayed: row.matches,
          distinctOpponents: row.opponents,
        };
      }),
    };
  }

  /**
   * The caller's ranked standing for the requested period, plus `periods[]`
   * with every running honor period (month, season, year) so the app can
   * switch tabs without another call.
   */
  async getMine(
    userId: string,
    params: {
      sport?: SportType;
      period?: LeaderboardPeriod;
      periodKey?: string;
    }
  ) {
    const sport = params.sport ?? 'BADMINTON';
    const period = params.period ?? 'month';
    if (!(await this.honorFlag.isEnabled())) {
      return {
        ...this.emptyStanding(sport, period, params.periodKey),
        enabled: false,
        periods: [],
      };
    }
    const [requested, ...periods] = await Promise.all([
      this.standingFor(userId, sport, period, params.periodKey),
      ...HONOR_PERIODS.map((p) => this.standingFor(userId, sport, p)),
    ]);
    return {
      ...requested,
      enabled: true,
      periods: periods.map(({ sport: _s, requirements: _r, ...rest }) => rest),
    };
  }

  private async standingFor(
    userId: string,
    sport: SportType,
    period: LeaderboardPeriod,
    periodKey?: string
  ) {
    const range = resolvePeriodRange(period, periodKey);
    const scope = { sport, start: range.start, end: range.end };
    const [mine] = await this.aggregate(scope, {
      userId,
      applyEligibility: false,
    });
    const stats = mine ?? { points: 0, matches: 0, wins: 0, opponents: 0 };
    const eligible =
      stats.matches >= RANKED.minVerifiedMatches &&
      stats.opponents >= RANKED.minDistinctOpponents;
    const rank = eligible
      ? (await this.countEligible(scope, stats.points)) + 1
      : null;
    return {
      sport,
      period,
      periodKey: range.key,
      points: stats.points,
      matchesPlayed: stats.matches,
      matchesWon: stats.wins,
      distinctOpponents: stats.opponents,
      eligible,
      rank,
      requirements: REQUIREMENTS,
    };
  }

  private emptyStanding(
    sport: SportType,
    period: LeaderboardPeriod,
    periodKey?: string
  ) {
    return {
      sport,
      period,
      periodKey: resolvePeriodRange(period, periodKey).key,
      points: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      distinctOpponents: 0,
      eligible: false,
      rank: null,
      requirements: REQUIREMENTS,
    };
  }

  /** Eligible standings, best first. Shared with the honor review. */
  standings(scope: RangeParams, page: { limit: number; offset: number }) {
    return this.aggregate(scope, { applyEligibility: true, ...page });
  }

  private async countEligible(
    scope: RangeParams,
    abovePoints?: number
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM (${this.aggregateSql(scope, {
        applyEligibility: true,
        abovePoints,
      })}) ranked
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async aggregate(
    scope: RangeParams,
    opts: {
      userId?: string;
      applyEligibility: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<RankedStandingRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        points: number;
        matches: number;
        wins: number;
        opponents: number;
      }[]
    >(Prisma.sql`
      ${this.aggregateSql(scope, opts)}
      ORDER BY points DESC, "userId" ASC
      ${opts.limit != null ? Prisma.sql`LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}` : Prisma.empty}
    `);
    return rows.map((r) => ({
      userId: r.userId,
      points: Number(r.points),
      matches: Number(r.matches),
      wins: Number(r.wins),
      opponents: Number(r.opponents),
    }));
  }

  private aggregateSql(
    scope: RangeParams,
    opts: { userId?: string; applyEligibility: boolean; abovePoints?: number }
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`t."sport" = ${scope.sport}::"SportType"`,
    ];
    if (scope.start)
      conditions.push(Prisma.sql`t."occurredAt" >= ${scope.start}`);
    if (scope.end) conditions.push(Prisma.sql`t."occurredAt" < ${scope.end}`);
    if (opts.userId) conditions.push(Prisma.sql`t."userId" = ${opts.userId}`);
    const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (opts.applyEligibility) {
      filters.push(Prisma.sql`agg.matches >= ${RANKED.minVerifiedMatches}`);
      filters.push(
        Prisma.sql`COALESCE(opp.opponents, 0) >= ${RANKED.minDistinctOpponents}`
      );
    }
    if (opts.abovePoints != null) {
      filters.push(Prisma.sql`agg.points > ${opts.abovePoints}`);
    }

    return Prisma.sql`
      WITH base AS (
        SELECT t."userId", t."points", t."reason", t."opponentUserIds"
        FROM "ranked_point_transactions" t
        WHERE ${Prisma.join(conditions, ' AND ')}
      ),
      agg AS (
        SELECT "userId",
               COALESCE(SUM("points"), 0)::int AS points,
               COUNT(*)::int AS matches,
               (COUNT(*) FILTER (WHERE "reason" = 'SESSION_MATCH_WIN'))::int AS wins
        FROM base GROUP BY "userId"
      ),
      opp AS (
        SELECT b."userId", COUNT(DISTINCT o)::int AS opponents
        FROM base b CROSS JOIN LATERAL unnest(b."opponentUserIds") AS o
        GROUP BY b."userId"
      )
      SELECT agg."userId" AS "userId", agg.points, agg.matches, agg.wins,
             COALESCE(opp.opponents, 0)::int AS opponents
      FROM agg LEFT JOIN opp ON opp."userId" = agg."userId"
      WHERE ${Prisma.join(filters, ' AND ')}
    `;
  }
}
