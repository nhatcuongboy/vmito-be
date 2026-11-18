import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SportType } from '@prisma/client';
import { resolvePeriodRange } from '../points.constants';
import { HonorReviewService } from './honor-review.service';
import { PlayerHonorFlagService } from './player-honor-flag.service';
import { HONOR_PERIODS } from './ranked.constants';

@Injectable()
export class RankedScheduler {
  private readonly logger = new Logger(RankedScheduler.name);

  constructor(
    private readonly honorReviews: HonorReviewService,
    private readonly honorFlag: PlayerHonorFlagService
  ) {}

  /**
   * Nightly: a DRAFT honor review for every period that just ended. Waits a
   * few days so disputes raised right after the period can land first.
   */
  @Cron('30 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async draftHonorReviews(now = new Date()) {
    // Admins can still generate reviews by hand while the feature is off.
    if (!(await this.honorFlag.isEnabled())) return;
    const settled = new Date(now.getTime() - 3 * 86_400_000);
    for (const period of HONOR_PERIODS) {
      const current = resolvePeriodRange(period, undefined, settled);
      const previousKey = resolvePeriodRange(
        period,
        undefined,
        new Date(current.start!.getTime() - 1)
      ).key!;
      for (const sport of Object.values(SportType)) {
        try {
          const review = await this.honorReviews.generateMissing(
            sport,
            period,
            previousKey
          );
          if (review)
            this.logger.log(
              `Drafted honor review ${sport} ${period} ${previousKey}`
            );
        } catch (error) {
          this.logger.error(
            `draft ${sport} ${period} ${previousKey} failed: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    }
  }
}
