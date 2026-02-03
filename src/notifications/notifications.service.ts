import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SessionsGateway,
  SessionEventType,
} from '../sessions/sessions.gateway';
import {
  CreateNotificationDto,
  BroadcastNotificationDto,
  QueryNotificationsDto,
} from './dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsGateway: SessionsGateway
  ) {}

  /**
   * Create a notification for a specific user
   */
  async create(userId: string, dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: dto.data as Prisma.InputJsonValue,
      },
    });

    // Send real-time notification via socket
    this.sessionsGateway.notifyUser(
      userId,
      SessionEventType.NOTIFICATION_RECEIVED,
      notification
    );

    return notification;
  }

  /**
   * Create notification for a user (used internally by other services)
   */
  async createForUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Prisma.InputJsonValue
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ?? Prisma.JsonNull,
      },
    });

    // Send real-time notification via socket
    this.sessionsGateway.notifyUser(
      userId,
      SessionEventType.NOTIFICATION_RECEIVED,
      notification
    );

    return notification;
  }

  /**
   * Get all notifications for a user with pagination
   */
  async findAll(userId: string, query: QueryNotificationsDto) {
    const { type, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(type && { type }),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { count };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { message: 'All notifications marked as read' };
  }

  /**
   * Delete a notification
   */
  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Broadcast a notification to all users (Admin only)
   */
  async broadcastToAll(dto: BroadcastNotificationDto) {
    const startTime = Date.now();
    this.logger.log(
      `[Broadcast] Starting broadcast: "${dto.title.substring(0, 50)}..."`
    );

    // Get all user IDs
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    this.logger.log(`[Broadcast] Found ${users.length} users to notify`);

    if (users.length === 0) {
      return { message: 'No users to notify', count: 0 };
    }

    // Create notifications for all users efficiently
    const notifications = await this.prisma.notification.createManyAndReturn({
      data: users.map((user) => ({
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: dto.title,
        message: dto.message,
      })),
    });

    this.logger.log(
      `[Broadcast] Created ${notifications.length} notifications in database`
    );

    // Send real-time notifications via socket to each user
    // We do this in a loop, but the database part is now much faster
    let sentCount = 0;
    for (const notification of notifications) {
      this.sessionsGateway.notifyUser(
        notification.userId,
        SessionEventType.NOTIFICATION_RECEIVED,
        notification
      );
      sentCount++;
    }

    const duration = Date.now() - startTime;
    this.logger.log(
      `[Broadcast] Completed: Sent ${sentCount} socket events to ${users.length} users in ${duration}ms`
    );

    return {
      message: `Notification broadcast to ${users.length} users`,
      count: users.length,
    };
  }
}
