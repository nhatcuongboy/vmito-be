import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { StreamChatService } from './stream-chat.service';

@Module({
  imports: [PrismaModule, FeatureFlagsModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, StreamChatService],
  exports: [ChatService, StreamChatService],
})
export class ChatModule {}
