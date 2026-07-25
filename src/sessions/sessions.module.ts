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
import { SessionAccessModule } from '../common/session-access/session-access.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    ClubsModule,
    UserImagesModule,
    SessionExpensesModule,
    SessionsGatewayModule,
    NotificationsModule,
    SessionAccessModule,
    FavoritesModule,
    ActivitiesModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionSchedulerService],
  exports: [SessionsService, SessionsGatewayModule],
})
export class SessionsModule {}
