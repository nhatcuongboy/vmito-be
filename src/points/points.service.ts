import { Injectable, Logger } from '@nestjs/common';
import { PointReason, Prisma, RankingTier, SportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SessionsGateway,
  SessionEventType,
} from '../sessions/sessions.gateway';
import {
  HOST_MIN_ACTIVE_PLAYERS,
  HOST_REASONS,
  POINT_VALUES,
  TIER_ORDER,
  tierForPoints,
} from './points.constants';

export interface PointEntry {
  userId: string;
  sport: SportType;
  reason: PointReason;
  refType: string;
  refId: string;
  occurredAt: Date;
}

const FINAL_ROUNDS = ['GF2', 'GF', 'F'];

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionsGateway: SessionsGateway
  ) {}

  /** Award points for a finished casual-session match. Idempotent, never throws. */
  async awardSessionMatch(
    matchId: string,
    options?: { silent?: boolean }
  ): Promise<void> {
    try {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { players: { include: { player: true } } },
      });
      if (!match || match.status !== 'FINISHED') return;

      const winnerPlayerIds = this.parseIds(match.winnerIds);
      // No recorded result at all → participation-only match, no points.
      if (winnerPlayerIds.length === 0 && !match.isDraw) return;

      const occurredAt = match.endTime ?? new Date();
      const entries: PointEntry[] = [];
      for (const mp of match.players) {
        const userId = mp.player.userId;
        if (!userId) continue;
        const reason: PointReason = match.isDraw
          ? 'SESSION_MATCH_DRAW'
          : winnerPlayerIds.includes(mp.playerId)
            ? 'SESSION_MATCH_WIN'
            : 'SESSION_MATCH_LOSS';
        entries.push({
          userId,
          sport: 'BADMINTON',
          reason,
          refType: 'MATCH',
          refId: matchId,
          occurredAt,
        });
      }
      await this.persistAndNotify(entries, options);
    } catch (error) {
      this.logSwallowed('awardSessionMatch', matchId, error);
    }
  }

  /** Re-award after a finished match's result was edited. */
  async reawardSessionMatch(matchId: string): Promise<void> {
    await this.removeForRef('MATCH', matchId);
    await this.awardSessionMatch(matchId, { silent: true });
  }

  /** Delete all points tied to a ref (result reset/edit) and refresh totals. */
  async removeForRef(refType: string, refId: string): Promise<void> {
    try {
      const existing = await this.prisma.pointTransaction.findMany({
        where: { refType, refId },
        select: { userId: true, sport: true },
      });
      if (existing.length === 0) return;
      await this.prisma.pointTransaction.deleteMany({
        where: { refType, refId },
      });
      const keys = new Map(existing.map((e) => [`${e.userId}:${e.sport}`, e]));
      for (const { userId, sport } of keys.values()) {
        await this.refreshState(userId, sport);
      }
    } catch (error) {
      this.logSwallowed('removeForRef', `${refType}:${refId}`, error);
    }
  }

  private async refreshState(userId: string, sport: SportType): Promise<void> {
    const { totalPoints, hostPoints } = await this.sumBoards(userId, sport);
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

  /** Player points and host points are ranked separately, so sum them apart. */
  private async sumBoards(
    userId: string,
    sport: SportType
  ): Promise<{ totalPoints: number; hostPoints: number }> {
    const rows = await this.prisma.pointTransaction.groupBy({
      by: ['reason'],
      where: { userId, sport },
      _sum: { points: true },
    });
    let totalPoints = 0;
    let hostPoints = 0;
    for (const row of rows) {
      const points = row._sum.points ?? 0;
      if (HOST_REASONS.includes(row.reason)) hostPoints += points;
      else totalPoints += points;
    }
    return { totalPoints, hostPoints };
  }

  /** Award points for a finished tournament (category) match. Idempotent, never throws. */
  async awardTournamentMatch(categoryMatchId: string): Promise<void> {
    try {
      const match = await this.prisma.categoryMatch.findUnique({
        where: { id: categoryMatchId },
        include: {
          category: {
            select: { tournament: { select: { sportType: true } } },
          },
          participants: {
            include: { categoryRegistration: REG_USERS_INCLUDE },
          },
        },
      });
      if (!match || match.status !== 'FINISHED') return;
      if (!match.winnerId && !match.isDraw) return;

      const sport = match.category.tournament.sportType;
      const occurredAt = match.endTime ?? new Date();
      const entries: PointEntry[] = [];
      for (const participant of match.participants) {
        const reason: PointReason = match.isDraw
          ? 'TOURNAMENT_MATCH_DRAW'
          : participant.categoryRegistrationId === match.winnerId
            ? 'TOURNAMENT_MATCH_WIN'
            : 'TOURNAMENT_MATCH_LOSS';
        for (const userId of registrationUserIds(
          participant.categoryRegistration
        )) {
          entries.push({
            userId,
            sport,
            reason,
            refType: 'CATEGORY_MATCH',
            refId: categoryMatchId,
            occurredAt,
          });
        }
      }
      await this.persistAndNotify(entries);
    } catch (error) {
      this.logSwallowed('awardTournamentMatch', categoryMatchId, error);
    }
  }

  /**
   * Points awarded when a session is finalized: participation for every linked
   * player who played, plus a hosting bonus when the session actually ran.
   * Idempotent, never throws.
   */
  async awardSessionCompletion(sessionId: string): Promise<void> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          status: true,
          endTime: true,
          hostId: true,
          isCrawled: true,
          players: { select: { userId: true, matchesPlayed: true } },
        },
      });
      if (!session || session.status !== 'FINISHED') return;

      const occurredAt = session.endTime ?? new Date();
      const entries = sessionCompletionEntries(session, sessionId, occurredAt);
      await this.persistAndNotify(entries);
    } catch (error) {
      this.logSwallowed('awardSessionCompletion', sessionId, error);
    }
  }

  /** Placement bonuses (champion / runner-up / semifinalists) per category. Idempotent, never throws. */
  async awardTournamentPlacements(tournamentId: string): Promise<void> {
    try {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: {
          sportType: true,
          endDate: true,
          categories: { select: { id: true } },
        },
      });
      if (!tournament) return;

      const entries: PointEntry[] = [];
      for (const category of tournament.categories) {
        entries.push(
          ...(await this.categoryPlacementEntries(
            category.id,
            tournament.sportType,
            tournament.endDate
          ))
        );
      }
      await this.persistAndNotify(entries, { notifyPlacement: true });
    } catch (error) {
      this.logSwallowed('awardTournamentPlacements', tournamentId, error);
    }
  }

  /** Also used by the backfill job — must stay side-effect free. */
  async categoryPlacementEntries(
    categoryId: string,
    sport: SportType,
    fallbackDate: Date
  ): Promise<PointEntry[]> {
    const finished = await this.prisma.categoryMatch.findMany({
      where: {
        categoryId,
        round: { in: [...FINAL_ROUNDS, 'SF'] },
        status: 'FINISHED',
        winnerId: { not: null },
      },
      include: {
        participants: { include: { categoryRegistration: REG_USERS_INCLUDE } },
      },
    });

    const finals = finished
      .filter((m) => FINAL_ROUNDS.includes(m.round))
      .sort(
        (a, b) => FINAL_ROUNDS.indexOf(a.round) - FINAL_ROUNDS.indexOf(b.round)
      );
    const final = finals[0];
    if (!final) return [];

    const occurredAt = final.endTime ?? fallbackDate;
    const entries: PointEntry[] = [];
    const push = (userIds: string[], reason: PointReason) => {
      for (const userId of userIds) {
        entries.push({
          userId,
          sport,
          reason,
          refType: 'CATEGORY',
          refId: categoryId,
          occurredAt,
        });
      }
    };

    for (const participant of final.participants) {
      const userIds = registrationUserIds(participant.categoryRegistration);
      push(
        userIds,
        participant.categoryRegistrationId === final.winnerId
          ? 'TOURNAMENT_CHAMPION'
          : 'TOURNAMENT_RUNNER_UP'
      );
    }

    // Semifinal losers → top 3-4.
    for (const sf of finished.filter((m) => m.round === 'SF')) {
      for (const participant of sf.participants) {
        if (participant.categoryRegistrationId === sf.winnerId) continue;
        push(
          registrationUserIds(participant.categoryRegistration),
          'TOURNAMENT_SEMIFINALIST'
        );
      }
    }
    return entries;
  }

  /**
   * Insert entries (skipping duplicates), refresh per-user totals/tiers and
   * push realtime "points_awarded" events. Tier promotions also create an
   * in-app notification.
   */
  async persistAndNotify(
    entries: PointEntry[],
    options?: { notifyPlacement?: boolean; silent?: boolean }
  ): Promise<void> {
    if (entries.length === 0) return;

    const keys = new Map<string, { userId: string; sport: SportType }>();
    for (const e of entries) {
      keys.set(`${e.userId}:${e.sport}`, { userId: e.userId, sport: e.sport });
    }
    const affected = [...keys.values()];

    const before = await this.prisma.userPointsState.findMany({
      where: {
        OR: affected.map((k) => ({ userId: k.userId, sport: k.sport })),
      },
    });
    const beforeByKey = new Map(
      before.map((s) => [`${s.userId}:${s.sport}`, s])
    );

    await this.prisma.pointTransaction.createMany({
      data: entries.map((e) => ({ ...e, points: POINT_VALUES[e.reason] })),
      skipDuplicates: true,
    });

    for (const { userId, sport } of affected) {
      const { totalPoints, hostPoints } = await this.sumBoards(userId, sport);
      const tier = tierForPoints(totalPoints);
      const prev = beforeByKey.get(`${userId}:${sport}`);
      const prevPoints = prev?.totalPoints ?? 0;
      const prevHostPoints = prev?.hostPoints ?? 0;
      const prevTier: RankingTier = prev?.tier ?? 'BRONZE';
      const delta = totalPoints - prevPoints;
      const hostDelta = hostPoints - prevHostPoints;
      if (delta === 0 && hostDelta === 0) continue; // Everything was a duplicate.

      await this.prisma.userPointsState.upsert({
        where: { userId_sport: { userId, sport } },
        create: { userId, sport, totalPoints, hostPoints, tier },
        update: { totalPoints, hostPoints, tier },
      });

      const tierChanged =
        TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(prevTier);
      // Host points are not on the player board, so they raise no celebration.
      if (!options?.silent && delta !== 0) {
        const reasons = entries
          .filter(
            (e) =>
              e.userId === userId &&
              e.sport === sport &&
              !HOST_REASONS.includes(e.reason)
          )
          .map((e) => e.reason);
        this.sessionsGateway.notifyUser(
          userId,
          SessionEventType.POINTS_AWARDED,
          {
            sport,
            points: delta,
            reasons,
            totalPoints,
            tier,
            previousTier: prevTier,
            tierChanged,
          }
        );
        if (tierChanged) {
          await this.notificationsService.createForUser(
            userId,
            'SYSTEM',
            'Rank up!',
            `Congratulations! You reached the ${tier} tier with ${totalPoints} ranking points.`,
            { action: 'tier_up', sport, tier, totalPoints }
          );
        }
      }
    }
  }

  private parseIds(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      // Legacy comma-separated format.
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  private logSwallowed(method: string, refId: string, error: unknown) {
    this.logger.warn(
      `${method}(${refId}) failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const REG_USERS_INCLUDE = {
  include: {
    player: { select: { userId: true } },
    pair: {
      include: {
        members: { include: { player: { select: { userId: true } } } },
      },
    },
  },
} satisfies Prisma.CategoryMatchParticipantInclude['categoryRegistration'];

type RegistrationWithUsers = {
  player: { userId: string | null } | null;
  pair: { members: { player: { userId: string | null } }[] } | null;
};

function registrationUserIds(registration: RegistrationWithUsers): string[] {
  const players = registration.player
    ? [registration.player]
    : (registration.pair?.members ?? []).map((m) => m.player);
  return players.map((p) => p.userId).filter((id): id is string => Boolean(id));
}

type SessionForPoints = {
  hostId: string | null;
  isCrawled: boolean;
  players: { userId: string | null; matchesPlayed: number }[];
};

/**
 * Participation entries for every linked player who played, plus the hosting
 * bonus. Shared with the backfill so live awards and history stay identical.
 */
export function sessionCompletionEntries(
  session: SessionForPoints,
  sessionId: string,
  occurredAt: Date
): PointEntry[] {
  const activeUserIds = new Set<string>();
  for (const player of session.players) {
    if (!player.userId || player.matchesPlayed < 1) continue;
    activeUserIds.add(player.userId);
  }

  const entries: PointEntry[] = [...activeUserIds].map((userId) => ({
    userId,
    sport: 'BADMINTON',
    reason: 'SESSION_PARTICIPATION',
    refType: 'SESSION',
    refId: sessionId,
    occurredAt,
  }));

  // Crawled sessions are imported from Facebook — nobody hosted them here.
  const hostQualifies =
    !session.isCrawled &&
    Boolean(session.hostId) &&
    activeUserIds.size >= HOST_MIN_ACTIVE_PLAYERS;

  if (hostQualifies && session.hostId) {
    entries.push({
      userId: session.hostId,
      sport: 'BADMINTON',
      reason: 'SESSION_HOSTED',
      refType: 'SESSION',
      refId: sessionId,
      occurredAt,
    });
  }
  return entries;
}
