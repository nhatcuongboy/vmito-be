import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { NewsfeedEngagementBoostService } from './newsfeed-engagement-boost.service';

@Module({
  imports: [PrismaModule, FeatureFlagsModule, SessionsGatewayModule],
  providers: [NewsfeedEngagementBoostService],
  exports: [NewsfeedEngagementBoostService],
})
export class NewsfeedEngagementBoostModule {}
