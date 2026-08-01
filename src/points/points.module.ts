import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { PointsService } from './points.service';
import { LeaderboardService } from './leaderboard.service';
import { PointsBackfillService } from './points-backfill.service';
import { PointsAdminService } from './points-admin.service';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, SessionsGatewayModule],
  controllers: [LeaderboardController],
  providers: [
    PointsService,
    LeaderboardService,
    PointsBackfillService,
    PointsAdminService,
  ],
  exports: [PointsService],
})
export class PointsModule {}
