import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { ChatModule } from '../chat/chat.module';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Module({
  imports: [PrismaModule, ActivitiesModule, ChatModule],
  controllers: [UsersController],
  providers: [UsersService, OptionalJwtAuthGuard],
  exports: [UsersService],
})
export class UsersModule {}
