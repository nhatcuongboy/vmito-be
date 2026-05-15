import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LevelDescriptionsController } from './level-descriptions.controller';
import { LevelDescriptionsService } from './level-descriptions.service';

@Module({
  imports: [PrismaModule],
  controllers: [LevelDescriptionsController],
  providers: [LevelDescriptionsService],
})
export class LevelDescriptionsModule {}
