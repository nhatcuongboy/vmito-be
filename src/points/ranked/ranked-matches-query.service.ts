import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePlayerIds } from './ranked-eligibility';
import { RANKED_REF_MATCH } from './ranked.constants';
import { myExclusion, sessionOrganizerIds } from './ranked-match-view';
import { PlayerHonorFlagService } from './player-honor-flag.service';
import type {
  AdminRankedMatchesQueryDto,
  MyRankedMatchesQueryDto,
} from './dto/ranked.dto';

const MATCH_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  score: true,
  winnerIds: true,
  rankedStatus: true,
  rankedIneligibleReason: true,
  rankedResolvedAt: true,
  rankedReviewedById: true,
  rankedReviewNote: true,
  rankedDisputeReason: true,
  rankedDisputeNote: true,
  rankedDisputedById: true,
  resultSubmittedById: true,
  session: {
    select: {
      id: true,
      name: true,
      sportType: true,
      hostId: true,
      scheduledStartTime: true,
      managers: { select: { userId: true } },
    },
  },
  court: { select: { courtNumber: true, courtName: true } },
  players: {
    orderBy: { position: 'asc' },
    select: {
      playerId: true,
      position: true,
      player: {
        select: {
          name: true,
          userId: true,
          user: {
            select: { id: true, name: true, image: true, createdAt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.MatchSelect;

type MatchRow = Prisma.MatchGetPayload<{ select: typeof MATCH_SELECT }>;

/**
 * Read side of the ranked matches: the player's own "Trận xếp hạng của tôi"
 * page (to spot a wrong result or a match they never played) and the admin
 * review list.
 */
@Injectable()
export class RankedMatchesQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly honorFlag: PlayerHonorFlagService
  ) {}

  async listMine(userId: string, query: MyRankedMatchesQueryDto) {
    if (!(await this.honorFlag.isEnabled())) {
      return {
        enabled: false,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total: 0,
        totalPages: 1,
        groups: [],
      };
    }
    const { page, limit, total, matches } = await this.find(query, {
      players: { some: { player: { userId } } },
    });
    const ids = matches.map((m) => m.id);
    const ledger = await this.prisma.rankedPointTransaction.findMany({
      where: { refType: RANKED_REF_MATCH, refId: { in: ids }, userId },
      select: { refId: true, points: true, multiplier: true },
    });
    const ledgerByMatch = new Map(ledger.map((l) => [l.refId, l]));

    // Group consecutive matches by session, keeping newest-first order.
    const groups: {
      session: MatchItem['session'];
      matches: (MatchItem & Record<string, unknown>)[];
    }[] = [];
    for (const match of matches) {
      const base = toMatchItem(match, userId);
      const item = {
        ...base,
        myExclusion: myExclusion({
          isOrganizer: base.isOrganizer,
          status: match.rankedStatus,
          ineligibleReason: match.rankedIneligibleReason,
        }),
        myPoints: ledgerByMatch.get(match.id) ?? null,
        myDispute:
          match.rankedDisputedById === userId
            ? {
                reason: match.rankedDisputeReason,
                note: match.rankedDisputeNote,
              }
            : null,
        // Settled by an admin, or already contested: no new dispute.
        canDispute:
          match.rankedStatus === 'VERIFIED' &&
          !match.rankedReviewedById &&
          !match.rankedDisputedById,
      };
      const last = groups[groups.length - 1];
      if (last && last.session.id === match.session.id) last.matches.push(item);
      else groups.push({ session: base.session, matches: [item] });
    }
    return {
      enabled: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      groups,
    };
  }

  async listForAdmin(query: AdminRankedMatchesQueryDto) {
    const { page, limit, total, matches } = await this.find(
      { ...query, status: query.status ?? 'DISPUTED' },
      query.userId
        ? { players: { some: { player: { userId: query.userId } } } }
        : {}
    );
    const ids = matches.map((m) => m.id);
    const [ledger, disputers] = await Promise.all([
      this.prisma.rankedPointTransaction.findMany({
        where: { refType: RANKED_REF_MATCH, refId: { in: ids } },
        select: { refId: true, userId: true, points: true, multiplier: true },
      }),
      this.prisma.user.findMany({
        where: {
          id: {
            in: matches
              .map((m) => m.rankedDisputedById)
              .filter((id): id is string => Boolean(id)),
          },
        },
        select: { id: true, name: true },
      }),
    ]);
    const disputerById = new Map(disputers.map((u) => [u.id, u]));
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      items: matches.map((m) => ({
        ...toMatchItem(m, null),
        reviewedById: m.rankedReviewedById,
        reviewNote: m.rankedReviewNote,
        ledger: ledger.filter((l) => l.refId === m.id),
        dispute: m.rankedDisputedById
          ? {
              reason: m.rankedDisputeReason,
              note: m.rankedDisputeNote,
              user: disputerById.get(m.rankedDisputedById) ?? {
                id: m.rankedDisputedById,
                name: null,
              },
            }
          : null,
      })),
    };
  }

  private async find(
    query: MyRankedMatchesQueryDto,
    extra: Prisma.MatchWhereInput
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.MatchWhereInput = {
      ...extra,
      rankedStatus: query.status ?? { not: null },
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.sport ? { session: { sportType: query.sport } } : {}),
    };
    const [total, matches] = await Promise.all([
      this.prisma.match.count({ where }),
      this.prisma.match.findMany({
        where,
        select: MATCH_SELECT,
        orderBy: [{ endTime: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { page, limit, total, matches };
  }
}

function toMatchItem(match: MatchRow, viewerId: string | null) {
  const winners = new Set(parsePlayerIds(match.winnerIds));
  const { managers: _managers, ...session } = match.session;
  const organizers = sessionOrganizerIds(match.session);
  const hostId = session.hostId;
  const isOrganizer = viewerId !== null && organizers.has(viewerId);
  const players = match.players.map((mp) => ({
    playerId: mp.playerId,
    position: mp.position,
    userId: mp.player.userId,
    name: mp.player.user?.name ?? mp.player.name,
    image: mp.player.user?.image ?? null,
    accountCreatedAt: mp.player.user?.createdAt ?? null,
    isGuest: !mp.player.userId,
    isHost: Boolean(hostId) && mp.player.userId === hostId,
    // Host or co-host of this session: never earns ranked points here.
    isOrganizer: Boolean(mp.player.userId) && organizers.has(mp.player.userId!),
    isWinner: winners.has(mp.playerId),
    isMe: viewerId !== null && mp.player.userId === viewerId,
  }));
  return {
    matchId: match.id,
    startTime: match.startTime,
    endTime: match.endTime,
    session: { ...session, isOrganizer },
    isOrganizer,
    court: match.court,
    score: match.score,
    status: match.rankedStatus,
    ineligibleReason: match.rankedIneligibleReason,
    resolvedAt: match.rankedResolvedAt,
    submittedById: match.resultSubmittedById,
    players,
    iWon: players.some((p) => p.isMe && p.isWinner),
  };
}

type MatchItem = ReturnType<typeof toMatchItem>;
