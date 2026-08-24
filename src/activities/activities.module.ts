import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityFeedService } from './activity-feed.service';
import { NewsfeedEngagementBoostModule } from '../newsfeed-engagement-boost/newsfeed-engagement-boost.module';

@Module({
  imports: [PrismaModule, NewsfeedEngagementBoostModule],
  providers: [ActivityFeedService],
  exports: [ActivityFeedService],
})
export class ActivitiesModule {}
