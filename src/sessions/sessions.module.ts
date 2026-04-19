import { Module, forwardRef } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGateway } from './sessions.gateway';
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
    forwardRef(() => NotificationsModule),
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsGateway, SessionSchedulerService],
  exports: [SessionsService, SessionsGateway],
})
export class SessionsModule {}
