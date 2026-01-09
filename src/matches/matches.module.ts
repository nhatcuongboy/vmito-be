import { Module } from '@nestjs/common';
import {
  MatchesController,
  SessionMatchesController,
} from './matches.controller';
import { MatchesService } from './matches.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MatchesController, SessionMatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
