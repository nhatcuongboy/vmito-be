import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AiModule } from '../ai/ai.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ConfigModule, AiModule, SessionsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
