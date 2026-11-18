import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PointsService } from './points.service';
import { LeaderboardService } from './leaderboard.service';
import { PointsBackfillService } from './points-backfill.service';
import { PointsAdminService } from './points-admin.service';
import { LeaderboardController } from './leaderboard.controller';
import { RankedPointsService } from './ranked/ranked-points.service';
import { RankedMatchService } from './ranked/ranked-match.service';
import { RankedMatchesQueryService } from './ranked/ranked-matches-query.service';
import { RankedMatchController } from './ranked/ranked-match.controller';
import { RankedLeaderboardService } from './ranked/ranked-leaderboard.service';
import { HonorReviewService } from './ranked/honor-review.service';
import { RankedAdminController } from './ranked/ranked-admin.controller';
import { RankedScheduler } from './ranked/ranked.scheduler';
import { PlayerHonorFlagService } from './ranked/player-honor-flag.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    SessionsGatewayModule,
    FeatureFlagsModule,
  ],
  controllers: [
    LeaderboardController,
    RankedMatchController,
    RankedAdminController,
  ],
  providers: [
    PointsService,
    LeaderboardService,
    PointsBackfillService,
    PointsAdminService,
    RankedPointsService,
    RankedMatchService,
    RankedMatchesQueryService,
    RankedLeaderboardService,
    HonorReviewService,
    RankedScheduler,
    PlayerHonorFlagService,
  ],
  exports: [PointsService, RankedMatchService],
})
export class PointsModule {}
