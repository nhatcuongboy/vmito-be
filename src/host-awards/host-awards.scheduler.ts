import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriodRange } from '../points/points.constants';
import { HostAwardsService } from './host-awards.service';

@Injectable()
export class HostAwardsScheduler {
  private readonly logger = new Logger(HostAwardsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awards: HostAwardsService
  ) {}

  /**
   * Nightly: refresh the running month's provisional board, and keep
   * refreshing last month until its finalize day, when the snapshot moves to
   * PENDING_REVIEW and waits for an admin (no more automatic recomputes).
   */
  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async refresh() {
    const now = new Date();
    const current = resolvePeriodRange('month', undefined, now);
    const previousKey = resolvePeriodRange(
      'month',
      undefined,
      new Date(current.start!.getTime() - 1)
    ).key!;

    const previous = await this.prisma.hostAwardPeriod.findUnique({
      where: { monthKey: previousKey },
      select: { status: true },
    });
    const keys = [current.key!];
    if (!previous || previous.status === 'PROVISIONAL') keys.push(previousKey);

    for (const key of keys) {
      try {
        await this.awards.computeSnapshot(key, now);
      } catch (error) {
        this.logger.error(
          `Host awards refresh for ${key} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
