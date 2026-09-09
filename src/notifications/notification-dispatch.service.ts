import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationDispatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

const PUSH_BATCH_SIZE = 500;
const STALE_LOCK_MS = 5 * 60_000;

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService
  ) {}

  @Cron('*/10 * * * * *')
  async processNextBroadcastBatch() {
    const now = new Date();
    await this.prisma.broadcastNotificationDispatchJob.updateMany({
      where: {
        status: NotificationDispatchStatus.PROCESSING,
        lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) },
      },
      data: {
        status: NotificationDispatchStatus.FAILED,
        availableAt: now,
        lockedAt: null,
        lastError: 'Recovered stale dispatch lock',
      },
    });

    const candidate =
      await this.prisma.broadcastNotificationDispatchJob.findFirst({
        where: {
          status: {
            in: [
              NotificationDispatchStatus.PENDING,
              NotificationDispatchStatus.FAILED,
            ],
          },
          availableAt: { lte: now },
        },
        include: { broadcast: true },
        orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      });
    if (!candidate) return { processed: 0 };

    const claimed =
      await this.prisma.broadcastNotificationDispatchJob.updateMany({
        where: { id: candidate.id, status: candidate.status },
        data: {
          status: NotificationDispatchStatus.PROCESSING,
          lockedAt: now,
          attempts: { increment: 1 },
        },
      });
    if (!claimed.count) return { processed: 0 };

    try {
      if (candidate.broadcast.deletedAt) {
        await this.complete(candidate.id, candidate.cursor);
        return { processed: 0 };
      }
      const devices = await this.prisma.notificationDevice.findMany({
        where: {
          user: {
            is: { createdAt: { lte: candidate.broadcast.audienceCutoffAt } },
          },
          ...(candidate.cursor ? { id: { gt: candidate.cursor } } : {}),
        },
        select: { id: true, token: true },
        orderBy: { id: 'asc' },
        take: PUSH_BATCH_SIZE,
      });
      await this.pushNotifications.sendBroadcast(
        {
          id: candidate.broadcast.id,
          type: candidate.broadcast.type,
          title: candidate.broadcast.title,
          message: candidate.broadcast.message,
          data: candidate.broadcast.data,
        },
        devices.map((device) => device.token)
      );

      const cursor = devices.at(-1)?.id ?? candidate.cursor;
      if (devices.length < PUSH_BATCH_SIZE) {
        await this.complete(candidate.id, cursor);
      } else {
        await this.prisma.broadcastNotificationDispatchJob.update({
          where: { id: candidate.id },
          data: {
            status: NotificationDispatchStatus.PENDING,
            cursor,
            availableAt: new Date(),
            lockedAt: null,
            lastError: null,
          },
        });
      }
      this.logger.log(
        JSON.stringify({
          event: 'notification_broadcast_push_batch',
          broadcastId: candidate.broadcastId,
          deviceCount: devices.length,
          completed: devices.length < PUSH_BATCH_SIZE,
        })
      );
      return { processed: devices.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = candidate.attempts + 1;
      const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
      await this.prisma.broadcastNotificationDispatchJob.update({
        where: { id: candidate.id },
        data: {
          status: NotificationDispatchStatus.FAILED,
          availableAt: new Date(Date.now() + delaySeconds * 1000),
          lockedAt: null,
          lastError: message.slice(0, 2000),
        },
      });
      this.logger.error(
        JSON.stringify({
          event: 'notification_broadcast_push_failed',
          broadcastId: candidate.broadcastId,
          attempts,
          message,
        })
      );
      return { processed: 0, failed: true };
    }
  }

  private complete(jobId: string, cursor?: string | null) {
    return this.prisma.broadcastNotificationDispatchJob.update({
      where: { id: jobId },
      data: {
        status: NotificationDispatchStatus.COMPLETED,
        cursor,
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }
}
