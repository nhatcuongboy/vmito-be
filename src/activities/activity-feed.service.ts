import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivityMetadata,
  TournamentFinishedCategory,
  TournamentPodiumSide,
} from './activity-metadata.types';

/**
 * Creates auto-generated "activity" posts on the newsfeed when domain
 * actions succeed (session created, club created, tournament finished, ...).
 *
 * Every `post*` method swallows its own errors: a failed activity post must
 * never fail the domain action that triggered it. `shareSessionResults` is
 * the exception — it is user-triggered, so it throws normally.
 */
@Injectable()
export class ActivityFeedService {
  private readonly logger = new Logger(ActivityFeedService.name);

  constructor(private prisma: PrismaService) {}

  async postSessionCreated(session: {
    id: string;
    slug?: string | null;
    name: string;
    hostId: string;
    coverPhoto?: string | null;
    scheduledStartTime?: Date | null;
    location?: string | null;
    isCrawled?: boolean;
  }): Promise<void> {
    if (session.isCrawled) return;
    await this.safeCreate(session.hostId, ActivityType.SESSION_CREATED, {
      sessionId: session.id,
      sessionSlug: session.slug ?? null,
      sessionName: session.name,
      coverPhoto: session.coverPhoto ?? null,
      scheduledStartTime: session.scheduledStartTime?.toISOString() ?? null,
      location: session.location ?? null,
    });
  }

  async postClubCreated(
    club: {
      id: string;
      slug?: string | null;
      name: string;
      logo?: string | null;
    },
    actorId: string
  ): Promise<void> {
    await this.safeCreate(actorId, ActivityType.CLUB_CREATED, {
      clubId: club.id,
      clubSlug: club.slug ?? null,
      clubName: club.name,
      logo: club.logo ?? null,
    });
  }

  async postClubUpdated(
    club: {
      id: string;
      slug?: string | null;
      name: string;
      logo?: string | null;
    },
    actorId: string
  ): Promise<void> {
    try {
      // Debounce: at most one CLUB_UPDATED post per author/club per 6 hours.
      if (
        await this.hasRecentActivity(
          ActivityType.CLUB_UPDATED,
          actorId,
          'clubId',
          club.id,
          6
        )
      ) {
        return;
      }
      await this.createActivityPost(actorId, ActivityType.CLUB_UPDATED, {
        clubId: club.id,
        clubSlug: club.slug ?? null,
        clubName: club.name,
        logo: club.logo ?? null,
      });
    } catch (error) {
      this.logActivityError(ActivityType.CLUB_UPDATED, error);
    }
  }

  async postClubMemberJoined(
    club: {
      id: string;
      slug?: string | null;
      name: string;
      logo?: string | null;
    },
    userId: string
  ): Promise<void> {
    await this.safeCreate(userId, ActivityType.CLUB_MEMBER_JOINED, {
      clubId: club.id,
      clubSlug: club.slug ?? null,
      clubName: club.name,
      logo: club.logo ?? null,
    });
  }

  async postTournamentCreated(tournament: {
    id: string;
    slug?: string | null;
    name: string;
    hostId: string;
    coverPhoto?: string | null;
    startDate?: Date | null;
    venueName?: string | null;
  }): Promise<void> {
    await this.safeCreate(tournament.hostId, ActivityType.TOURNAMENT_CREATED, {
      tournamentId: tournament.id,
      tournamentSlug: tournament.slug ?? null,
      tournamentName: tournament.name,
      coverPhoto: tournament.coverPhoto ?? null,
      startDate: tournament.startDate?.toISOString() ?? null,
      venueName: tournament.venueName ?? null,
    });
  }

  async postTournamentFinished(tournamentId: string): Promise<void> {
    try {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, slug: true, name: true, hostId: true },
      });
      if (!tournament) return;

      const categories = await this.prisma.category.findMany({
        where: { tournamentId },
        select: { id: true, name: true },
      });

      const podiums: TournamentFinishedCategory[] = [];
      for (const category of categories) {
        const podium = await this.resolveCategoryPodium(category.id);
        if (podium) {
          podiums.push({
            categoryId: category.id,
            categoryName: category.name,
            ...podium,
          });
        }
      }
      // No category produced a decided final (e.g. pure round-robin) → no post.
      if (podiums.length === 0) return;

      await this.createActivityPost(
        tournament.hostId,
        ActivityType.TOURNAMENT_FINISHED,
        {
          tournamentId: tournament.id,
          tournamentSlug: tournament.slug ?? null,
          tournamentName: tournament.name,
          categories: podiums,
        }
      );
    } catch (error) {
      this.logActivityError(ActivityType.TOURNAMENT_FINISHED, error);
    }
  }

  async postAvatarUpdated(userId: string, image: string): Promise<void> {
    try {
      // Debounce: at most one AVATAR_UPDATED post per user per 6 hours.
      const recent = await this.prisma.post.findFirst({
        where: {
          type: 'ACTIVITY',
          activityType: ActivityType.AVATAR_UPDATED,
          authorId: userId,
          createdAt: { gte: this.hoursAgo(6) },
        },
        select: { id: true },
      });
      if (recent) return;
      await this.createActivityPost(userId, ActivityType.AVATAR_UPDATED, {
        image,
      });
    } catch (error) {
      this.logActivityError(ActivityType.AVATAR_UPDATED, error);
    }
  }

  async postUserRated(
    raterUserId: string,
    rated: { id: string; name: string | null; image?: string | null },
    sessionId?: string
  ): Promise<void> {
    try {
      // Debounce: at most one USER_RATED post per (rater, rated) per 24 hours.
      if (
        await this.hasRecentActivity(
          ActivityType.USER_RATED,
          raterUserId,
          'ratedUserId',
          rated.id,
          24
        )
      ) {
        return;
      }
      await this.createActivityPost(raterUserId, ActivityType.USER_RATED, {
        ratedUserId: rated.id,
        ratedName: rated.name ?? 'Unknown',
        ratedImage: rated.image ?? null,
        sessionId: sessionId ?? null,
      });
    } catch (error) {
      this.logActivityError(ActivityType.USER_RATED, error);
    }
  }

  /**
   * User-triggered: share a FINISHED session's final standings to the feed.
   * Throws (unlike the post* hooks) so the caller gets proper HTTP errors.
   */
  async shareSessionResults(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        hostId: true,
        endTime: true,
        players: { select: { userId: true } },
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.status !== 'FINISHED') {
      throw new BadRequestException('Session has not finished yet');
    }
    const isParticipant =
      session.hostId === userId ||
      session.players.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenException(
        'Only the host or session players can share session results'
      );
    }
    const alreadyShared = await this.prisma.post.findFirst({
      where: {
        type: 'ACTIVITY',
        activityType: ActivityType.SESSION_RESULTS,
        authorId: userId,
        metadata: { path: ['sessionId'], equals: sessionId },
      },
      select: { id: true },
    });
    if (alreadyShared) {
      throw new BadRequestException(
        "You have already shared this session's results"
      );
    }

    // Standings ranked by win rate, mirroring the host "Player statistics"
    // overview (win rate → wins → matches → name, MVP-eligible players first).
    // Point-differential tiebreak is intentionally omitted here: this is a
    // frozen feed snapshot, and computing it would require parsing every score.
    const players = await this.prisma.player.findMany({
      where: { sessionId, registrationStatus: 'APPROVED' },
      select: {
        id: true,
        playerNumber: true,
        name: true,
        totalWaitTime: true,
        userId: true,
        user: { select: { image: true } },
      },
    });
    const matches = await this.prisma.match.findMany({
      where: { sessionId },
      select: {
        winnerIds: true,
        players: { select: { playerId: true } },
      },
    });

    const parseWinnerIds = (raw: string | null): string[] => {
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    };

    const stats = players.map((p) => {
      const played = matches.filter((m) =>
        m.players.some((mp) => mp.playerId === p.id)
      );
      const wins = played.filter((m) =>
        parseWinnerIds(m.winnerIds).includes(p.id)
      ).length;
      const totalMatches = played.length;
      return {
        playerNumber: p.playerNumber,
        name: p.name ?? `Player ${p.playerNumber}`,
        userId: p.userId ?? null,
        image: p.user?.image ?? null,
        totalWaitTime: p.totalWaitTime,
        totalMatches,
        wins,
        winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
      };
    });

    const maxMatches = stats.reduce(
      (max, s) => Math.max(max, s.totalMatches),
      0
    );
    const minMatches =
      maxMatches <= 0
        ? 1
        : Math.max(1, Math.min(3, Math.ceil(maxMatches * 0.5)));
    const compare = (a: (typeof stats)[number], b: (typeof stats)[number]) =>
      b.winRate - a.winRate ||
      b.wins - a.wins ||
      b.totalMatches - a.totalMatches ||
      a.name.localeCompare(b.name);
    const isEligible = (s: (typeof stats)[number]) =>
      s.totalMatches >= minMatches && s.wins > 0;
    const ranked = [
      ...stats.filter(isEligible).sort(compare),
      ...stats.filter((s) => !isEligible(s)).sort(compare),
    ];

    return this.createActivityPost(userId, ActivityType.SESSION_RESULTS, {
      sessionId: session.id,
      sessionSlug: session.slug ?? null,
      sessionName: session.name,
      endTime: session.endTime?.toISOString() ?? null,
      standings: ranked.map((s, index) => ({
        rank: index + 1,
        playerNumber: s.playerNumber,
        name: s.name,
        matchesPlayed: s.totalMatches,
        wins: s.wins,
        winRate: s.winRate,
        totalWaitTime: s.totalWaitTime,
        userId: s.userId,
        image: s.image,
      })),
    });
  }

  // -------------------------------------------------------------------

  /**
   * Champion/runner-up of one category from its decided final match.
   * Precedence GF2 > GF > F (double-elim grand finals over single-elim final).
   * Returns null when the category has no decided final (e.g. round-robin).
   */
  private async resolveCategoryPodium(categoryId: string): Promise<{
    champion: TournamentPodiumSide;
    runnerUp: TournamentPodiumSide | null;
  } | null> {
    const finals = await this.prisma.categoryMatch.findMany({
      where: {
        categoryId,
        round: { in: ['F', 'GF', 'GF2'] },
        status: 'FINISHED',
        winnerId: { not: null },
      },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: { select: { name: true, userId: true } },
                pair: {
                  include: {
                    members: {
                      include: {
                        player: { select: { name: true, userId: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (finals.length === 0) return null;

    const precedence = ['GF2', 'GF', 'F'];
    const final = finals.sort(
      (a, b) => precedence.indexOf(a.round) - precedence.indexOf(b.round)
    )[0];

    const toSide = (
      participant: (typeof final.participants)[number]
    ): TournamentPodiumSide => {
      const registration = participant.categoryRegistration;
      const players = registration.player
        ? [registration.player]
        : (registration.pair?.members ?? []).map((m) => m.player);
      return {
        players: players.map((p) => ({
          name: p.name,
          userId: p.userId ?? null,
        })),
      };
    };

    const winner = final.participants.find(
      (p) => p.categoryRegistrationId === final.winnerId
    );
    const loser = final.participants.find(
      (p) => p.categoryRegistrationId !== final.winnerId
    );
    if (!winner) return null;

    return {
      champion: toSide(winner),
      runnerUp: loser ? toSide(loser) : null,
    };
  }

  private async safeCreate(
    authorId: string,
    activityType: ActivityType,
    metadata: ActivityMetadata
  ): Promise<void> {
    try {
      await this.createActivityPost(authorId, activityType, metadata);
    } catch (error) {
      this.logActivityError(activityType, error);
    }
  }

  private createActivityPost(
    authorId: string,
    activityType: ActivityType,
    metadata: ActivityMetadata
  ) {
    return this.prisma.post.create({
      data: {
        content: '',
        authorId,
        type: 'ACTIVITY',
        activityType,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** JSON-path lookup (Postgres) — same pattern as posts.service hasUnreadLikeNotification. */
  private async hasRecentActivity(
    activityType: ActivityType,
    authorId: string,
    entityKey: string,
    entityId: string,
    hours: number
  ): Promise<boolean> {
    const existing = await this.prisma.post.findFirst({
      where: {
        type: 'ACTIVITY',
        activityType,
        authorId,
        createdAt: { gte: this.hoursAgo(hours) },
        metadata: { path: [entityKey], equals: entityId },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 3_600_000);
  }

  private logActivityError(activityType: ActivityType, error: unknown) {
    this.logger.warn(
      `Failed to create ${activityType} activity post: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
