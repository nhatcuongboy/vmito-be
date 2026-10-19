import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { HostAwardDataService } from './host-award-data.service';
import { HostAwardsService } from './host-awards.service';
import { HostAwardsQueryService } from './host-awards-query.service';
import { HostAwardsScheduler } from './host-awards.scheduler';
import { HostAwardsController } from './host-awards.controller';
import { HostAwardsAdminController } from './host-awards-admin.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, FeatureFlagsModule],
  controllers: [HostAwardsController, HostAwardsAdminController],
  providers: [
    HostAwardDataService,
    HostAwardsService,
    HostAwardsQueryService,
    HostAwardsScheduler,
  ],
  exports: [HostAwardsQueryService],
})
export class HostAwardsModule {}
