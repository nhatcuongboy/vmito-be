import { Injectable } from '@nestjs/common';
import {
  JoinRequestStatus,
  MemberRole,
  MemberStatus,
  NotificationType,
  Prisma,
  Role,
  VenueRequestStatus,
} from '@prisma/client';
import { PLAYER_VIP_ENABLED } from '../common/constants/feature-flags';
import { PrismaService } from '../prisma/prisma.service';

const COUNT_CONCURRENCY = 20;

/**
 * Which broadcast campaigns are visible to (or unread by) one user. Shared by
 * the inbox endpoints and the push badge so the number on the app icon can
 * never disagree with the number the inbox reports.
 */
export function broadcastWhereForUser(
  userId: string,
  userCreatedAt: Date,
  deletedThroughAt?: Date | null,
  type?: NotificationType,
  unreadOnly = false
): Prisma.BroadcastNotificationWhereInput {
  return {
    deletedAt: null,
    ...(type && { type }),
    audienceCutoffAt: { gte: userCreatedAt },
    ...(deletedThroughAt ? { createdAt: { gt: deletedThroughAt } } : {}),
    userStates: {
      none: {
        userId,
        ...(unreadOnly
          ? { OR: [{ readAt: { not: null } }, { deletedAt: { not: null } }] }
          : { deletedAt: { not: null } }),
      },
    },
  };
}

export function latestDate(...dates: Array<Date | null | undefined>) {
  return dates.reduce<Date | undefined>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    undefined
  );
}

/**
 * Everything the bell (web + app) and the app icon count, split by source.
 * `total` is the one number every surface shows.
 */
export interface BadgeCounts {
  unread: number;
  sessionRequests: number;
  clubRequests: number;
  venueRequests: number;
  total: number;
}

const EMPTY_BADGE: BadgeCounts = {
  unread: 0,
  sessionRequests: 0,
  clubRequests: 0,
  venueRequests: 0,
  total: 0,
};

/** Who may act on session join requests — `hostFeatureAccess` on clients. */
function canManageSessions(role: Role) {
  return (
    role === Role.HOST ||
    role === Role.ADMIN ||
    ((role === Role.PLAYER || role === Role.REFEREE) && PLAYER_VIP_ENABLED)
  );
}

/** Mirrors the guards on `GET /clubs/my/join-requests` (no REFEREE). */
function canManageClubRequests(role: Role) {
  return (
    role === Role.HOST ||
    role === Role.ADMIN ||
    (role === Role.PLAYER && PLAYER_VIP_ENABLED)
  );
}

/**
 * Single source of truth for the notification badge. The bell on web and app
 * (`GET /notifications/badge-count`), the app icon and the number stamped
 * into every push all come from [badgeCountsForUser], so no two surfaces can
 * disagree.
 *
 * Formula: unread inbox items + requests awaiting this user's decision. The
 * two never overlap — a new join or venue request reaches its reviewer over
 * the socket and as a pending item, never as an inbox row.
 */
@Injectable()
export class NotificationUnreadCountService {
  constructor(private readonly prisma: PrismaService) {}

  async badgeCountsForUser(userId: string): Promise<BadgeCounts> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, createdAt: true },
    });
    if (!user) return EMPTY_BADGE;
    const [unread, sessionRequests, clubRequests, venueRequests] =
      await Promise.all([
        this.unreadCount(userId, user.createdAt),
        canManageSessions(user.role)
          ? this.prisma.player.count({
              where: {
                registrationStatus: 'PENDING',
                session: { hostId: userId },
              },
            })
          : 0,
        canManageClubRequests(user.role)
          ? this.prisma.clubJoinRequest.count({
              where: {
                status: JoinRequestStatus.PENDING,
                club: managedClubWhere(userId),
              },
            })
          : 0,
        user.role === Role.ADMIN
          ? this.prisma.venueRequest.count({
              where: { status: VenueRequestStatus.PENDING },
            })
          : 0,
      ]);
    return {
      unread,
      sessionRequests,
      clubRequests,
      venueRequests,
      total: unread + sessionRequests + clubRequests + venueRequests,
    };
  }

  /** Direct unread rows plus unread broadcast campaigns for one user. */
  async unreadCountForUser(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    return user ? this.unreadCount(userId, user.createdAt) : 0;
  }

  /**
   * Badge totals for several users, with bounded concurrency. A failed lookup
   * is left out of the map: the push then carries no badge and the app
   * corrects the icon itself on its next foreground sync, which beats
   * dropping the push over a cosmetic number.
   */
  async badgeTotalsForUsers(userIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const unique = [...new Set(userIds)];
    for (let offset = 0; offset < unique.length; offset += COUNT_CONCURRENCY) {
      const chunk = unique.slice(offset, offset + COUNT_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((userId) => this.badgeCountsForUser(userId))
      );
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          counts.set(chunk[index], result.value.total);
        }
      });
    }
    return counts;
  }

  private async unreadCount(userId: string, userCreatedAt: Date) {
    const inbox = await this.prisma.notificationInboxState.findUnique({
      where: { userId },
    });
    const unreadAfter = latestDate(
      inbox?.broadcastReadThroughAt,
      inbox?.broadcastDeletedThroughAt
    );
    const [direct, broadcasts] = await Promise.all([
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.broadcastNotification.count({
        where: broadcastWhereForUser(
          userId,
          userCreatedAt,
          unreadAfter,
          NotificationType.SYSTEM,
          true
        ),
      }),
    ]);
    return direct + broadcasts;
  }
}

/** Clubs whose join requests [userId] reviews: host or ADMIN/MODERATOR. */
export function managedClubWhere(userId: string): Prisma.ClubWhereInput {
  return {
    OR: [
      { hostId: userId },
      {
        members: {
          some: {
            userId,
            status: MemberStatus.ACTIVE,
            role: { in: [MemberRole.ADMIN, MemberRole.MODERATOR] },
          },
        },
      },
    ],
  };
}
