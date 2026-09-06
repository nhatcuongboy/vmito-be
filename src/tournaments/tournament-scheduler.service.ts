import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  TournamentEventType,
  TournamentsGateway,
} from './realtime/tournaments.gateway';
import { getVietnamTodayDate } from './tournament-date';

@Injectable()
export class TournamentSchedulerService {
  private readonly logger = new Logger(TournamentSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TournamentsGateway
  ) {}

  /** Cancel tournaments that reached the day after endDate without starting. */
  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredPreparingTournaments(now = new Date()): Promise<void> {
    const today = getVietnamTodayDate(now);

    try {
      const expired = await this.prisma.tournament.findMany({
        where: { status: 'PREPARING', endDate: { lt: today } },
        select: { id: true },
      });

      for (const tournament of expired) {
        const result = await this.prisma.tournament.updateMany({
          where: {
            id: tournament.id,
            status: 'PREPARING',
            endDate: { lt: today },
          },
          data: { status: 'CANCELLED' },
        });
        if (result.count !== 1) continue;

        this.gateway.notifyTournamentEvent(
          tournament.id,
          TournamentEventType.TOURNAMENT_ENDED,
          { status: 'CANCELLED', reason: 'expired_without_starting' }
        );
      }

      if (expired.length > 0) {
        this.logger.log(
          `[AutoCancel] Checked ${expired.length} expired preparing tournament(s)`
        );
      }
    } catch (error) {
      this.logger.error(
        '[AutoCancel] Error cancelling expired tournaments',
        error
      );
    }
  }
}
