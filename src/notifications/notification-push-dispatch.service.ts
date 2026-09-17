import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationDispatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

const STALE_LOCK_MS = 5 * 60_000;

/** Retries user-targeted notification push jobs from the durable outbox. */
@Injectable()
export class NotificationPushDispatchService {
  private readonly logger = new Logger(NotificationPushDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService
  ) {}

  @Cron('*/10 * * * * *')
  async processNext() {
    const now = new Date();
    await this.prisma.notificationPushDispatchJob.updateMany({
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

    const candidate = await this.prisma.notificationPushDispatchJob.findFirst({
      where: {
        status: {
          in: [
            NotificationDispatchStatus.PENDING,
            NotificationDispatchStatus.FAILED,
          ],
        },
        availableAt: { lte: now },
      },
      include: { notification: true },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return { processed: 0 };

    const claimed = await this.prisma.notificationPushDispatchJob.updateMany({
      where: { id: candidate.id, status: candidate.status },
      data: {
        status: NotificationDispatchStatus.PROCESSING,
        lockedAt: now,
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return { processed: 0 };

    try {
      await this.pushNotifications.sendOrThrow(candidate.notification);
      await this.prisma.notificationPushDispatchJob.update({
        where: { id: candidate.id },
        data: {
          status: NotificationDispatchStatus.COMPLETED,
          completedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      return { processed: 1 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = candidate.attempts + 1;
      const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
      await this.prisma.notificationPushDispatchJob.update({
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
          event: 'notification_push_failed',
          notificationId: candidate.notificationId,
          attempts,
          message,
        })
      );
      return { processed: 0, failed: true };
    }
  }
}
