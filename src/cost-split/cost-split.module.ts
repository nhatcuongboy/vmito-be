import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { CostSplitController } from './cost-split.controller';
import { CostSplitService } from './cost-split.service';

@Module({
  imports: [
    PrismaModule,
    ClubsModule,
    NotificationsModule,
    SessionsGatewayModule,
  ],
  controllers: [CostSplitController],
  providers: [CostSplitService],
})
export class CostSplitModule {}
