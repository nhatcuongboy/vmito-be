import { Module } from '@nestjs/common';
import { SessionAccessModule } from '../common/session-access/session-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';
import { SessionManagersController } from './session-managers.controller';
import { SessionManagersService } from './session-managers.service';

@Module({
  imports: [SessionAccessModule, NotificationsModule, SessionsGatewayModule],
  controllers: [SessionManagersController],
  providers: [SessionManagersService],
})
export class SessionManagersModule {}
