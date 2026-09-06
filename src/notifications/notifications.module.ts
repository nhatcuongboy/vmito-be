import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { PushNotificationsService } from './push-notifications.service';

@Module({
  imports: [PrismaModule, SessionsGatewayModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
