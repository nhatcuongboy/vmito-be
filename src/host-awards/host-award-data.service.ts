import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AwardRating,
  AwardSession,
  AwardUser,
  MonthDataset,
  ParticipationRow,
} from './host-awards.types';

/** Keeps `IN (...)` lists well under Postgres' bind-parameter limit. */
const CHUNK = 5000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(items.slice(i, i + CHUNK));
  }
  return out;
}

/** Reads everything one month of host awards needs, in a few batched queries. */
@Injectable()
export class HostAwardDataService {
  constructor(private readonly prisma: PrismaService) {}

  async loadMonth(
    start: Date,
    end: Date,
    options: { hostIds?: string[]; asOf?: Date } = {}
  ): Promise<MonthDataset> {
    const asOf = options.asOf ?? new Date();
    const hostFilter = options.hostIds ? { in: options.hostIds } : undefined;

    const [sessions, cancelled] = await Promise.all([
      this.loadSessions(start, end, hostFilter),
      this.loadCancelledCounts(start, end, hostFilter),
    ]);

    const hostIds = [
      ...new Set([
        ...(options.hostIds ?? []),
        ...sessions.map((s) => s.hostId),
        ...cancelled.keys(),
      ]),
    ];
    const playerUserIds = [
      ...new Set(
        sessions.flatMap((s) =>
          s.players.map((p) => p.userId).filter((id): id is string => !!id)
        )
      ),
    ];
    const userIds = [...new Set([...hostIds, ...playerUserIds])];

    const [
      users,
      devices,
      ratings,
      participation,
      blocks,
      firstHosted,
      sanctions,
    ] = await Promise.all([
      this.loadUsers(userIds),
      this.loadDevices(userIds),
      this.loadRatings(sessions.map((s) => s.id)),
      this.loadParticipation(playerUserIds, asOf),
      this.loadBlocks(hostIds, playerUserIds),
      this.loadFirstHosted(hostIds),
      this.loadSanctionedHosts(hostIds, start, asOf),
    ]);

    return {
      start,
      end,
      asOf,
      sessions,
      cancelledByHost: cancelled,
      users,
      deviceIdsByUser: devices,
      ratings,
      participationByUser: participation,
      blocks,
      firstHostedAt: firstHosted,
      sanctionedHostIds: sanctions,
    };
  }

  private async loadSessions(
    start: Date,
    end: Date,
    hostId?: { in: string[] }
  ): Promise<AwardSession[]> {
    const rows = await this.prisma.session.findMany({
      where: {
        status: 'FINISHED',
        isCrawled: false,
        endTime: { gte: start, lt: end },
        hostId,
      },
      select: {
        id: true,
        hostId: true,
        startTime: true,
        endTime: true,
        isInternal: true,
        players: {
          select: {
            id: true,
            userId: true,
            createdByUserId: true,
            matchesPlayed: true,
            name: true,
            profileId: true,
          },
        },
        matches: {
          select: {
            status: true,
            startTime: true,
            endTime: true,
            players: { select: { playerId: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      ...row,
      matches: row.matches.map((m) => ({
        status: m.status,
        startTime: m.startTime,
        endTime: m.endTime,
        playerIds: m.players.map((p) => p.playerId),
      })),
    }));
  }

  /** Sessions cancelled during the month after someone had registered. */
  private async loadCancelledCounts(
    start: Date,
    end: Date,
    hostId?: { in: string[] }
  ): Promise<Map<string, number>> {
    const range = { gte: start, lt: end };
    const rows = await this.prisma.session.groupBy({
      by: ['hostId'],
      where: {
        status: 'CANCELLED',
        isCrawled: false,
        hostId,
        players: { some: {} },
        OR: [{ cancelledAt: range }, { cancelledAt: null, updatedAt: range }],
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.hostId, r._count._all]));
  }

  private async loadUsers(userIds: string[]): Promise<Map<string, AwardUser>> {
    const users = new Map<string, AwardUser>();
    for (const ids of chunks(userIds)) {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          createdAt: true,
          role: true,
        },
      });
      for (const row of rows) {
        users.set(row.id, {
          id: row.id,
          createdAt: row.createdAt,
          isAdmin: row.role === 'ADMIN',
        });
      }
    }
    return users;
  }

  private async loadDevices(userIds: string[]): Promise<Map<string, string[]>> {
    const devices = new Map<string, string[]>();
    for (const ids of chunks(userIds)) {
      const rows = await this.prisma.notificationDevice.findMany({
        where: { userId: { in: ids }, deviceId: { not: null } },
        select: { userId: true, deviceId: true },
      });
      for (const row of rows) {
        const list = devices.get(row.userId) ?? [];
        if (row.deviceId && !list.includes(row.deviceId)) {
          list.push(row.deviceId);
        }
        devices.set(row.userId, list);
      }
    }
    return devices;
  }

  private async loadRatings(sessionIds: string[]): Promise<AwardRating[]> {
    const ratings: AwardRating[] = [];
    for (const ids of chunks(sessionIds)) {
      ratings.push(
        ...(await this.prisma.rating.findMany({
          where: { sessionId: { in: ids } },
          select: {
            id: true,
            sessionId: true,
            raterUserId: true,
            ratedUserId: true,
            type: true,
            rating: true,
            createdAt: true,
          },
        }))
      );
    }
    return ratings;
  }

  /** Lifetime sessions each player actually played in, up to `asOf`. */
  private async loadParticipation(
    userIds: string[],
    asOf: Date
  ): Promise<Map<string, ParticipationRow[]>> {
    const byUser = new Map<string, ParticipationRow[]>();
    for (const ids of chunks(userIds)) {
      const rows = await this.prisma.player.findMany({
        where: {
          userId: { in: ids },
          matchesPlayed: { gte: 1 },
          session: {
            status: 'FINISHED',
            isCrawled: false,
            endTime: { lte: asOf },
          },
        },
        select: {
          userId: true,
          createdByUserId: true,
          sessionId: true,
          session: { select: { hostId: true, endTime: true } },
        },
      });
      for (const row of rows) {
        if (!row.userId) continue;
        const list = byUser.get(row.userId) ?? [];
        list.push({
          sessionId: row.sessionId,
          hostId: row.session.hostId,
          endTime: row.session.endTime,
          selfRegistered: row.createdByUserId === row.userId,
        });
        byUser.set(row.userId, list);
      }
    }
    return byUser;
  }

  private async loadBlocks(hostIds: string[], playerUserIds: string[]) {
    if (hostIds.length === 0 || playerUserIds.length === 0) return [];
    const blocks: { blockerId: string; blockedId: string }[] = [];
    for (const ids of chunks(playerUserIds)) {
      blocks.push(
        ...(await this.prisma.userBlock.findMany({
          where: { blockedId: { in: hostIds }, blockerId: { in: ids } },
          select: { blockerId: true, blockedId: true },
        }))
      );
    }
    return blocks;
  }

  private async loadFirstHosted(hostIds: string[]): Promise<Map<string, Date>> {
    const first = new Map<string, Date>();
    for (const ids of chunks(hostIds)) {
      const rows = await this.prisma.session.groupBy({
        by: ['hostId'],
        where: { hostId: { in: ids }, status: 'FINISHED', isCrawled: false },
        _min: { endTime: true },
      });
      for (const row of rows) {
        if (row._min.endTime) first.set(row.hostId, row._min.endTime);
      }
    }
    return first;
  }

  /** Sanctions that overlap the month, including ones issued during review. */
  private async loadSanctionedHosts(
    hostIds: string[],
    start: Date,
    asOf: Date
  ): Promise<Set<string>> {
    const rows = await this.prisma.hostAwardSanction.findMany({
      where: {
        hostId: { in: hostIds },
        createdAt: { lte: asOf },
        OR: [{ until: null }, { until: { gt: start } }],
      },
      select: { hostId: true },
    });
    return new Set(rows.map((r) => r.hostId));
  }
}
