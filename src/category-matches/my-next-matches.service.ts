import { Injectable } from '@nestjs/common';
import { MatchStatus, Prisma, TournamentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const NEXT_MATCH_SELECT = {
  id: true,
  round: true,
  matchNumber: true,
  matchCode: true,
  status: true,
  startTime: true,
  court: { select: { id: true, courtNumber: true, courtName: true } },
  category: {
    select: {
      id: true,
      name: true,
      tournament: { select: { id: true, name: true, sportType: true } },
    },
  },
  participants: {
    orderBy: { position: 'asc' },
    select: {
      position: true,
      categoryRegistration: {
        select: {
          player: { select: { id: true, name: true, userId: true } },
          pair: {
            select: {
              name: true,
              members: {
                orderBy: { position: 'asc' },
                select: {
                  player: { select: { id: true, name: true, userId: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CategoryMatchSelect;

/**
 * The caller's own upcoming matches as a *player* (not referee) across every
 * tournament: live matches first, then by start time, unscheduled last.
 */
@Injectable()
export class MyNextMatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string, limit?: number) {
    const take = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        status: { in: [MatchStatus.IN_PROGRESS, MatchStatus.SCHEDULED] },
        category: {
          tournament: {
            status: {
              in: [TournamentStatus.PREPARING, TournamentStatus.IN_PROGRESS],
            },
          },
        },
        participants: {
          some: {
            categoryRegistration: {
              OR: [
                { player: { userId } },
                { pair: { members: { some: { player: { userId } } } } },
              ],
            },
          },
        },
      },
      select: NEXT_MATCH_SELECT,
      orderBy: [
        { status: 'asc' }, // IN_PROGRESS sorts before SCHEDULED
        { startTime: { sort: 'asc', nulls: 'last' } },
        { matchNumber: 'asc' },
      ],
      take,
    });

    return matches.map(({ participants, ...match }) => ({
      ...match,
      sides: participants.map((p) => {
        const reg = p.categoryRegistration;
        const players = reg.pair
          ? reg.pair.members.map((m) => m.player)
          : reg.player
            ? [reg.player]
            : [];
        return {
          position: p.position,
          name: reg.pair?.name ?? players.map((pl) => pl.name).join(' / '),
          players: players.map(({ id, name }) => ({ id, name })),
          isMe: players.some((pl) => pl.userId === userId),
        };
      }),
    }));
  }
}
