import { Injectable, Logger } from '@nestjs/common';
import { SportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PointsService,
  PointEntry,
  sessionCompletionEntries,
} from './points.service';
import { HOST_REASONS, POINT_VALUES, tierForPoints } from './points.constants';

/**
 * Recomputes historical points from every finished match/session/tournament.
 * Safe to run repeatedly: inserts skip duplicates and totals are rebuilt from
 * scratch afterwards.
 */
@Injectable()
export class PointsBackfillService {
  private readonly logger = new Logger(PointsBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService
  ) {}

  async backfillAll() {
    const entries: PointEntry[] = [
      ...(await this.sessionMatchEntries()),
      ...(await this.sessionParticipationEntries()),
      ...(await this.tournamentMatchEntries()),
      ...(await this.tournamentPlacementEntries()),
    ];

    const inserted = await this.prisma.pointTransaction.createMany({
      data: entries.map((e) => ({ ...e, points: POINT_VALUES[e.reason] })),
      skipDuplicates: true,
    });

    const usersUpdated = await this.rebuildStates();
    this.logger.log(
      `Backfill done: ${inserted.count}/${entries.length} transactions inserted, ${usersUpdated} user states rebuilt`
    );
    return {
      candidates: entries.length,
      inserted: inserted.count,
      usersUpdated,
    };
  }

  private async sessionMatchEntries(): Promise<PointEntry[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'FINISHED',
        OR: [{ winnerIds: { not: null } }, { isDraw: true }],
      },
      select: {
        id: true,
        winnerIds: true,
        isDraw: true,
        endTime: true,
        createdAt: true,
        players: {
          select: { playerId: true, player: { select: { userId: true } } },
        },
      },
    });

    const entries: PointEntry[] = [];
    for (const match of matches) {
      const winnerPlayerIds = parseIds(match.winnerIds);
      if (winnerPlayerIds.length === 0 && !match.isDraw) continue;
      const occurredAt = match.endTime ?? match.createdAt;
      for (const mp of match.players) {
        if (!mp.player.userId) continue;
        entries.push({
          userId: mp.player.userId,
          sport: 'BADMINTON',
          reason: match.isDraw
            ? 'SESSION_MATCH_DRAW'
            : winnerPlayerIds.includes(mp.playerId)
              ? 'SESSION_MATCH_WIN'
              : 'SESSION_MATCH_LOSS',
          refType: 'MATCH',
          refId: match.id,
          occurredAt,
        });
      }
    }
    return entries;
  }

  private async sessionParticipationEntries(): Promise<PointEntry[]> {
    const sessions = await this.prisma.session.findMany({
      where: { status: 'FINISHED' },
      select: {
        id: true,
        endTime: true,
        updatedAt: true,
        hostId: true,
        isCrawled: true,
        players: { select: { userId: true, matchesPlayed: true } },
      },
    });

    return sessions.flatMap((session) =>
      sessionCompletionEntries(
        session,
        session.id,
        session.endTime ?? session.updatedAt
      )
    );
  }

  private async tournamentMatchEntries(): Promise<PointEntry[]> {
    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        status: 'FINISHED',
        OR: [{ winnerId: { not: null } }, { isDraw: true }],
      },
      select: {
        id: true,
        winnerId: true,
        isDraw: true,
        endTime: true,
        createdAt: true,
        category: { select: { tournament: { select: { sportType: true } } } },
        participants: {
          select: {
            categoryRegistrationId: true,
            categoryRegistration: {
              select: {
                player: { select: { userId: true } },
                pair: {
                  select: {
                    members: {
                      select: { player: { select: { userId: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const entries: PointEntry[] = [];
    for (const match of matches) {
      const sport = match.category.tournament.sportType;
      const occurredAt = match.endTime ?? match.createdAt;
      for (const participant of match.participants) {
        const reg = participant.categoryRegistration;
        const players = reg.player
          ? [reg.player]
          : (reg.pair?.members ?? []).map((m) => m.player);
        for (const p of players) {
          if (!p.userId) continue;
          entries.push({
            userId: p.userId,
            sport,
            reason: match.isDraw
              ? 'TOURNAMENT_MATCH_DRAW'
              : participant.categoryRegistrationId === match.winnerId
                ? 'TOURNAMENT_MATCH_WIN'
                : 'TOURNAMENT_MATCH_LOSS',
            refType: 'CATEGORY_MATCH',
            refId: match.id,
            occurredAt,
          });
        }
      }
    }
    return entries;
  }

  private async tournamentPlacementEntries(): Promise<PointEntry[]> {
    const tournaments = await this.prisma.tournament.findMany({
      where: { status: 'FINISHED' },
      select: {
        sportType: true,
        endDate: true,
        categories: { select: { id: true } },
      },
    });

    const entries: PointEntry[] = [];
    for (const tournament of tournaments) {
      for (const category of tournament.categories) {
        entries.push(
          ...(await this.pointsService.categoryPlacementEntries(
            category.id,
            tournament.sportType,
            tournament.endDate
          ))
        );
      }
    }
    return entries;
  }

  /** Rebuild every UserPointsState from the ledger. */
  private async rebuildStates(): Promise<number> {
    const totals = await this.prisma.pointTransaction.groupBy({
      by: ['userId', 'sport', 'reason'],
      _sum: { points: true },
    });

    const byUser = new Map<
      string,
      {
        userId: string;
        sport: SportType;
        totalPoints: number;
        hostPoints: number;
      }
    >();
    for (const row of totals) {
      const key = `${row.userId}:${row.sport}`;
      const state = byUser.get(key) ?? {
        userId: row.userId,
        sport: row.sport,
        totalPoints: 0,
        hostPoints: 0,
      };
      const points = row._sum.points ?? 0;
      if (HOST_REASONS.includes(row.reason)) state.hostPoints += points;
      else state.totalPoints += points;
      byUser.set(key, state);
    }

    for (const { userId, sport, totalPoints, hostPoints } of byUser.values()) {
      await this.prisma.userPointsState.upsert({
        where: { userId_sport: { userId, sport } },
        create: {
          userId,
          sport,
          totalPoints,
          hostPoints,
          tier: tierForPoints(totalPoints),
        },
        update: { totalPoints, hostPoints, tier: tierForPoints(totalPoints) },
      });
    }
    return byUser.size;
  }
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
