import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_DAYS = 90;
const DELETE_BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 10;

@Injectable()
export class NotificationMaintenanceService {
  private readonly logger = new Logger(NotificationMaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async cleanupReadNotifications() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let deleted = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const count = await this.prisma.$executeRaw(
        Prisma.sql`
          WITH candidates AS (
            SELECT id
            FROM notifications
            WHERE "isRead" = true AND "createdAt" < ${cutoff}
            ORDER BY "createdAt" ASC
            LIMIT ${DELETE_BATCH_SIZE}
          )
          DELETE FROM notifications n
          USING candidates c
          WHERE n.id = c.id
        `
      );
      deleted += count;
      if (count < DELETE_BATCH_SIZE) break;
    }
    if (deleted > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'notification_retention_cleanup',
          retentionDays: RETENTION_DAYS,
          deleted,
        })
      );
    }
    return { deleted };
  }
}
