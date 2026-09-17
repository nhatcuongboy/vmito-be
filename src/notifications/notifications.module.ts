import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { PushNotificationsService } from './push-notifications.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationMaintenanceService } from './notification-maintenance.service';
import { NotificationPushDispatchService } from './notification-push-dispatch.service';

@Module({
  imports: [PrismaModule, SessionsGatewayModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PushNotificationsService,
    NotificationDispatchService,
    NotificationPushDispatchService,
    NotificationMaintenanceService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
