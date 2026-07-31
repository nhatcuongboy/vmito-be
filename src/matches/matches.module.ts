import { Module } from '@nestjs/common';
import {
  MatchesController,
  SessionMatchesController,
} from './matches.controller';
import { MatchesService } from './matches.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionAccessModule } from '../common/session-access/session-access.module';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [PrismaModule, SessionAccessModule, PointsModule],
  controllers: [MatchesController, SessionMatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
