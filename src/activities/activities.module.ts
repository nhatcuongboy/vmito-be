import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityFeedService } from './activity-feed.service';

@Module({
  imports: [PrismaModule],
  providers: [ActivityFeedService],
  exports: [ActivityFeedService],
})
export class ActivitiesModule {}
