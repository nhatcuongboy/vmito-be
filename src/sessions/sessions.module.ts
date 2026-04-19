import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGatewayModule } from './sessions-gateway.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ClubsModule } from '../clubs/clubs.module';
import { UserImagesModule } from '../user-images/user-images.module';
import { SessionExpensesModule } from './expenses/session-expenses.module';
import { SessionSchedulerService } from './session-scheduler.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    ClubsModule,
    UserImagesModule,
    SessionExpensesModule,
    SessionsGatewayModule,
    NotificationsModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionSchedulerService],
  exports: [SessionsService, SessionsGatewayModule],
})
export class SessionsModule {}
