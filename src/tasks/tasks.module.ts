import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionAccessModule } from '../common/session-access/session-access.module';

@Module({
  imports: [AiModule, PrismaModule, SessionAccessModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
