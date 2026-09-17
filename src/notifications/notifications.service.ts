import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BroadcastNotification,
  Notification,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SessionsGateway,
  SessionEventType,
} from '../sessions/sessions.gateway';
import {
  BroadcastNotificationDto,
  CreateNotificationDto,
  QueryAdminNotificationsDto,
  QueryBroadcastNotificationsDto,
  QueryNotificationsDto,
  RegisterNotificationDeviceDto,
} from './dto';
import { PushNotificationsService } from './push-notifications.service';

export type NotificationConflictMode = 'ONCE' | 'COALESCE';

export interface CreateForUserOptions {
  dedupeKey?: string;
  conflictMode?: NotificationConflictMode;
}

export interface CreateManyForUsersOptions {
  dedupeKey?: (userId: string) => string;
  dataForUser?: (userId: string) => Prisma.InputJsonValue;
}

type FeedNotification = Pick<
  Notification,
  | 'id'
  | 'userId'
  | 'type'
  | 'title'
  | 'message'
  | 'data'
  | 'isRead'
  | 'createdAt'
>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsGateway: SessionsGateway,
    private readonly pushNotifications: PushNotificationsService
  ) {}

  async create(userId: string, dto: CreateNotificationDto) {
    return this.createForUser(
      userId,
      dto.type,
      dto.title,
      dto.message,
      dto.data as Prisma.InputJsonValue
    );
  }

  async createForUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Prisma.InputJsonValue,
    options: CreateForUserOptions = {}
  ) {
    const createData: Prisma.NotificationCreateInput = {
      user: { connect: { id: userId } },
      type,
      title,
      message,
      data: data ?? Prisma.JsonNull,
      dedupeKey: options.dedupeKey,
    };

    if (options.dedupeKey && options.conflictMode === 'COALESCE') {
      const notification = await this.prisma.notification.upsert({
        where: { dedupeKey: options.dedupeKey },
        create: createData,
        update: {
          title,
          message,
          data: data ?? Prisma.JsonNull,
          isRead: false,
          occurrenceCount: { increment: 1 },
          createdAt: new Date(),
        },
      });
      await this.dispatch(notification);
      return notification;
    }

    try {
      const notification = await this.prisma.notification.create({
        data: createData,
      });
      await this.dispatch(notification);
      return notification;
    } catch (error) {
      if (
        options.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          JSON.stringify({
            event: 'notification_idempotency_conflict',
            type,
            dedupeKey: options.dedupeKey,
          })
        );
        return this.prisma.notification.findUniqueOrThrow({
          where: { dedupeKey: options.dedupeKey },
        });
      }
      throw error;
    }
  }

  /**
   * Creates a notification and a durable push job atomically. The socket event
   * is emitted immediately, while FCM delivery is owned by the retry worker.
   * This is used for pending chat requests, whose Stream message must never be
   * recreated merely because push delivery failed.
   */
  async createQueuedForUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Prisma.InputJsonValue,
    options: CreateForUserOptions = {}
  ) {
    const createData: Prisma.NotificationCreateInput = {
      user: { connect: { id: userId } },
      type,
      title,
      message,
      data: data ?? Prisma.JsonNull,
      dedupeKey: options.dedupeKey,
    };

    try {
      const notification = await this.prisma.$transaction(async (tx) => {
        const created = await tx.notification.create({ data: createData });
        await tx.notificationPushDispatchJob.create({
          data: { notificationId: created.id },
        });
        return created;
      });
      this.dispatchSocket(notification);
      return notification;
    } catch (error) {
      if (
        options.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.notification.findUniqueOrThrow({
          where: { dedupeKey: options.dedupeKey },
        });
      }
      throw error;
    }
  }

  async createManyForUsers(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    data?: Prisma.InputJsonValue,
    options: CreateManyForUsersOptions = {}
  ) {
    const recipients = [...new Set(userIds.filter(Boolean))];
    if (recipients.length === 0) return [];

    const notifications = await this.prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({
        userId,
        type,
        title,
        message,
        data: options.dataForUser?.(userId) ?? data ?? Prisma.JsonNull,
        dedupeKey: options.dedupeKey?.(userId),
      })),
      skipDuplicates: true,
    });

    for (const notification of notifications) {
      this.sessionsGateway.notifyUser(
        notification.userId,
        SessionEventType.NOTIFICATION_RECEIVED,
        notification
      );
    }
    await this.pushNotifications.sendMany(notifications);
    return notifications;
  }

  async findAll(userId: string, query: QueryNotificationsDto) {
    const { type, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const typeFilter = type
      ? Prisma.sql`AND source.type::text = ${type}`
      : Prisma.empty;
    const feedSql = Prisma.sql`
      WITH inbox AS (
        SELECT
          u.id,
          u."createdAt" AS "userCreatedAt",
          i."broadcastReadThroughAt",
          i."broadcastDeletedThroughAt"
        FROM users u
        LEFT JOIN notification_inbox_states i ON i."userId" = u.id
        WHERE u.id = ${userId}
      ), source AS (
        SELECT
          n.id,
          n."userId",
          n.type,
          n.title,
          n.message,
          n.data,
          n."isRead",
          n."createdAt"
        FROM notifications n
        WHERE n."userId" = ${userId}
        UNION ALL
        SELECT
          b.id,
          ${userId}::text AS "userId",
          b.type,
          b.title,
          b.message,
          b.data,
          (
            state."readAt" IS NOT NULL OR
            (inbox."broadcastReadThroughAt" IS NOT NULL AND
              b."createdAt" <= inbox."broadcastReadThroughAt")
          ) AS "isRead",
          b."createdAt"
        FROM broadcast_notifications b
        CROSS JOIN inbox
        LEFT JOIN broadcast_notification_user_states state
          ON state."broadcastId" = b.id AND state."userId" = ${userId}
        WHERE b."deletedAt" IS NULL
          AND b."audienceCutoffAt" >= inbox."userCreatedAt"
          AND (state."deletedAt" IS NULL)
          AND (
            inbox."broadcastDeletedThroughAt" IS NULL OR
            b."createdAt" > inbox."broadcastDeletedThroughAt"
          )
      )
    `;
    const [data, totals] = await Promise.all([
      this.prisma.$queryRaw<FeedNotification[]>(Prisma.sql`
        ${feedSql}
        SELECT source.* FROM source
        WHERE true ${typeFilter}
        ORDER BY source."createdAt" DESC, source.id DESC
        OFFSET ${skip} LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        ${feedSql}
        SELECT COUNT(*)::bigint AS total FROM source
        WHERE true ${typeFilter}
      `),
    ]);
    const total = Number(totals[0]?.total ?? 0);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllForAdmin(query: QueryAdminNotificationsDto) {
    const {
      q,
      type,
      isRead,
      userId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      createdAt.lte = endDate;
    }

    const where: Prisma.NotificationWhereInput = {
      ...(type && { type }),
      ...(isRead != null && { isRead: isRead === 'true' }),
      ...(userId && { userId }),
      ...(dateFrom || dateTo ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { message: { contains: q, mode: 'insensitive' } },
              {
                user: {
                  is: {
                    OR: [
                      { email: { contains: q, mode: 'insensitive' } },
                      { name: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findBroadcastsForAdmin(query: QueryBroadcastNotificationsDto) {
    const { q, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      createdAt.lte = endDate;
    }
    const where: Prisma.BroadcastNotificationWhereInput = {
      deletedAt: null,
      ...(dateFrom || dateTo ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { message: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [campaigns, total] = await Promise.all([
      this.prisma.broadcastNotification.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.broadcastNotification.count({ where }),
    ]);

    const data = await Promise.all(
      campaigns.map(async (campaign) => {
        const inboxRead = {
          notificationInboxState: {
            is: { broadcastReadThroughAt: { gte: campaign.createdAt } },
          },
        } as const;
        const [explicitReads, cursorReads, overlappingReads] =
          await Promise.all([
            this.prisma.broadcastNotificationUserState.count({
              where: { broadcastId: campaign.id, readAt: { not: null } },
            }),
            this.prisma.user.count({
              where: {
                createdAt: { lte: campaign.audienceCutoffAt },
                ...inboxRead,
              },
            }),
            this.prisma.broadcastNotificationUserState.count({
              where: {
                broadcastId: campaign.id,
                readAt: { not: null },
                user: { is: inboxRead },
              },
            }),
          ]);
        return {
          ...campaign,
          readCount: explicitReads + cursorReads - overlappingReads,
        };
      })
    );
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    const [user, inbox] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      }),
      this.prisma.notificationInboxState.findUnique({ where: { userId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    const unreadAfter = this.latestDate(
      inbox?.broadcastReadThroughAt,
      inbox?.broadcastDeletedThroughAt
    );
    const [direct, broadcasts] = await Promise.all([
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.broadcastNotification.count({
        where: this.broadcastWhereForUser(
          userId,
          user.createdAt,
          unreadAfter,
          NotificationType.SYSTEM,
          true
        ),
      }),
    ]);
    return { count: direct + broadcasts };
  }

  async registerDevice(userId: string, dto: RegisterNotificationDeviceDto) {
    if (dto.deviceId) {
      await this.prisma.notificationDevice.deleteMany({
        where: {
          OR: [
            { deviceId: dto.deviceId },
            { userId, deviceId: null },
          ],
          token: { not: dto.token },
        },
      });
    }
    await this.prisma.notificationDevice.upsert({
      where: { token: dto.token },
      create: { userId, ...dto },
      update: { userId, ...dto, lastSeenAt: new Date() },
    });
    return { registered: true };
  }

  async unregisterDevice(userId: string, token: string) {
    const result = await this.prisma.notificationDevice.deleteMany({
      where: { userId, token },
    });
    return { removed: result.count > 0 };
  }

  async markAsRead(id: string, userId: string) {
    const direct = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (direct) {
      return this.prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });
    }
    const broadcast = await this.findEligibleBroadcast(id, userId);
    await this.prisma.broadcastNotificationUserState.upsert({
      where: { broadcastId_userId: { broadcastId: id, userId } },
      create: { broadcastId: id, userId, readAt: new Date() },
      update: { readAt: new Date() },
    });
    return { ...broadcast, isRead: true };
  }

  async markAllAsRead(userId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      }),
      this.prisma.notificationInboxState.upsert({
        where: { userId },
        create: { userId, broadcastReadThroughAt: now },
        update: { broadcastReadThroughAt: now },
      }),
    ]);
    return { message: 'All notifications marked as read' };
  }

  async delete(id: string, userId: string) {
    const direct = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (direct) {
      await this.prisma.notification.delete({ where: { id } });
      return { message: 'Notification deleted successfully' };
    }
    await this.findEligibleBroadcast(id, userId);
    await this.prisma.broadcastNotificationUserState.upsert({
      where: { broadcastId_userId: { broadcastId: id, userId } },
      create: { broadcastId: id, userId, deletedAt: new Date() },
      update: { deletedAt: new Date() },
    });
    return { message: 'Notification deleted successfully' };
  }

  async deleteAll(userId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.notificationInboxState.upsert({
        where: { userId },
        create: { userId, broadcastDeletedThroughAt: now },
        update: { broadcastDeletedThroughAt: now },
      }),
    ]);
    return { message: 'All notifications deleted successfully' };
  }

  async deleteAsAdmin(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    await this.prisma.notification.delete({ where: { id } });
    return { message: 'Notification deleted successfully' };
  }

  async deleteBroadcastAsAdmin(id: string) {
    const changed = await this.prisma.broadcastNotification.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('Broadcast not found');
    return { message: 'Broadcast deleted successfully' };
  }

  async broadcastToAll(
    adminUserId: string,
    dto: BroadcastNotificationDto,
    idempotencyKey?: string
  ) {
    const startedAt = Date.now();
    const audienceCutoffAt = new Date();
    const audienceCount = await this.prisma.user.count({
      where: { createdAt: { lte: audienceCutoffAt } },
    });
    if (audienceCount === 0) return { message: 'No users to notify', count: 0 };

    const dedupeKey = idempotencyKey?.trim()
      ? createHash('sha256')
          .update(`${adminUserId}\0${idempotencyKey.trim()}`)
          .digest('hex')
      : undefined;
    let broadcast: BroadcastNotification;
    try {
      const notificationData = dto.link?.trim()
        ? { link: dto.link.trim() }
        : undefined;
      broadcast = await this.prisma.broadcastNotification.create({
        data: {
          type: NotificationType.SYSTEM,
          title: dto.title,
          message: dto.message,
          data: notificationData,
          createdById: adminUserId,
          dedupeKey,
          audienceCutoffAt,
          audienceCount,
          dispatchJob: { create: {} },
        },
      });
    } catch (error) {
      if (
        dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing =
          await this.prisma.broadcastNotification.findUniqueOrThrow({
            where: { dedupeKey },
          });
        return {
          message: `Notification broadcast to ${existing.audienceCount} users`,
          count: existing.audienceCount,
        };
      }
      throw error;
    }
    this.sessionsGateway.notifyAllAuthenticatedUsers(
      SessionEventType.NOTIFICATION_RECEIVED,
      broadcast
    );
    this.logger.log(
      JSON.stringify({
        event: 'notification_broadcast_created',
        broadcastId: broadcast.id,
        audienceCount,
        durationMs: Date.now() - startedAt,
      })
    );
    return {
      message: `Notification broadcast to ${audienceCount} users`,
      count: audienceCount,
    };
  }

  private async dispatch(notification: Notification) {
    this.dispatchSocket(notification);
    await this.pushNotifications.send(notification);
  }

  private dispatchSocket(notification: Notification) {
    this.sessionsGateway.notifyUser(
      notification.userId,
      SessionEventType.NOTIFICATION_RECEIVED,
      notification
    );
  }

  private broadcastWhereForUser(
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

  private async findEligibleBroadcast(id: string, userId: string) {
    const [user, inbox] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      }),
      this.prisma.notificationInboxState.findUnique({ where: { userId } }),
    ]);
    if (!user) throw new NotFoundException('Notification not found');
    const broadcast = await this.prisma.broadcastNotification.findFirst({
      where: {
        id,
        ...this.broadcastWhereForUser(
          userId,
          user.createdAt,
          inbox?.broadcastDeletedThroughAt
        ),
      },
      include: {
        userStates: {
          where: { userId },
          select: { readAt: true, deletedAt: true },
          take: 1,
        },
      },
    });
    if (!broadcast) throw new NotFoundException('Notification not found');
    return this.toFeedNotification(
      userId,
      broadcast,
      inbox?.broadcastReadThroughAt
    );
  }

  private toFeedNotification(
    userId: string,
    broadcast: {
      id: string;
      type: NotificationType;
      title: string;
      message: string;
      data: Prisma.JsonValue;
      createdAt: Date;
      userStates: Array<{ readAt: Date | null; deletedAt: Date | null }>;
    },
    readThroughAt?: Date | null
  ): FeedNotification {
    return {
      id: broadcast.id,
      userId,
      type: broadcast.type,
      title: broadcast.title,
      message: broadcast.message,
      data: broadcast.data,
      isRead:
        Boolean(broadcast.userStates[0]?.readAt) ||
        Boolean(readThroughAt && broadcast.createdAt <= readThroughAt),
      createdAt: broadcast.createdAt,
    };
  }

  private latestDate(...dates: Array<Date | null | undefined>) {
    return dates.reduce<Date | undefined>(
      (latest, date) => (date && (!latest || date > latest) ? date : latest),
      undefined
    );
  }
}
