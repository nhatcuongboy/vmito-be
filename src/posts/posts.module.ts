import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../activities/activities.module';
import { SessionsGatewayModule } from '../sessions/sessions-gateway.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    NotificationsModule,
    ActivitiesModule,
    SessionsGatewayModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
