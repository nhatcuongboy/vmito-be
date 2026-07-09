import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentAccessModule } from '../common/tournament-access/tournament-access.module';
import { TournamentManagersController } from './tournament-managers.controller';
import { TournamentManagersService } from './tournament-managers.service';

@Module({
  imports: [PrismaModule, TournamentAccessModule],
  controllers: [TournamentManagersController],
  providers: [TournamentManagersService],
  exports: [TournamentManagersService],
})
export class TournamentManagersModule {}
