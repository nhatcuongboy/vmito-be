import { Injectable } from '@nestjs/common';
import { Prisma, SportType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RankedSide } from './ranked-eligibility';
import {
  cappedPoints,
  countPriorOpponents,
  matchMultiplier,
  vnDayRange,
} from './ranked-scoring';
import {
  DAY_MS,
  RANKED,
  RANKED_BASE_POINTS,
  RANKED_REF_MATCH,
} from './ranked.constants';

export interface RankedAwardInput {
  matchId: string;
  sport: SportType;
  occurredAt: Date;
  matchMinutes: number;
  sessionHostId: string | null;
  sides: RankedSide[];
}

/** Writes the verified-ranking ledger for one match. */
@Injectable()
export class RankedPointsService {
  constructor(private readonly prisma: PrismaService) {}

  /** (Re)builds the ranked rows of a match. Idempotent. */
  async awardMatch(input: RankedAwardInput): Promise<void> {
    await this.removeMatch(input.matchId);

    const rows: Prisma.RankedPointTransactionCreateManyInput[] = [];
    for (const side of input.sides) {
      const basePoints = RANKED_BASE_POINTS[side.reason] ?? 0;
      for (const userId of side.rankedUserIds) {
        const multiplier = await this.multiplierFor(userId, side, input);
        const earnedToday =
          basePoints > 0 ? await this.earnedOnDay(userId, input) : 0;
        rows.push({
          userId,
          sport: input.sport,
          reason: side.reason,
          basePoints,
          multiplier,
          points: cappedPoints(basePoints, multiplier, earnedToday),
          refType: RANKED_REF_MATCH,
          refId: input.matchId,
          opponentUserIds: side.opponentUserIds,
          guestOpponents: side.guestOpponents,
          sessionHostId: input.sessionHostId,
          matchMinutes: input.matchMinutes,
          occurredAt: input.occurredAt,
        });
      }
    }
    if (rows.length === 0) return;
    await this.prisma.rankedPointTransaction.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }

  async removeMatch(matchId: string): Promise<void> {
    await this.prisma.rankedPointTransaction.deleteMany({
      where: { refType: RANKED_REF_MATCH, refId: matchId },
    });
  }

  private async multiplierFor(
    userId: string,
    side: RankedSide,
    input: RankedAwardInput
  ): Promise<number> {
    const recent = side.opponentUserIds.length
      ? await this.prisma.rankedPointTransaction.findMany({
          where: {
            userId,
            sport: input.sport,
            refId: { not: input.matchId },
            opponentUserIds: { hasSome: side.opponentUserIds },
            occurredAt: {
              gte: new Date(
                input.occurredAt.getTime() -
                  RANKED.repeatOpponentWindowDays * DAY_MS
              ),
              lt: input.occurredAt,
            },
          },
          select: { opponentUserIds: true },
        })
      : [];
    return matchMultiplier(
      side.opponentUserIds,
      side.guestOpponents,
      countPriorOpponents(recent.map((r) => r.opponentUserIds))
    );
  }

  private async earnedOnDay(
    userId: string,
    input: RankedAwardInput
  ): Promise<number> {
    const { start, end } = vnDayRange(input.occurredAt);
    const agg = await this.prisma.rankedPointTransaction.aggregate({
      where: {
        userId,
        sport: input.sport,
        refId: { not: input.matchId },
        occurredAt: { gte: start, lt: end },
      },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }
}
