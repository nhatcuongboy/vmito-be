import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentPlayersController } from './tournament-players.controller';
import { TournamentPairsController } from './tournament-pairs.controller';
import { TournamentsService } from './tournaments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoriesModule } from '../categories/categories.module';
import { TournamentAccessModule } from '../common/tournament-access/tournament-access.module';
import { ScheduleGeneratorController } from './controllers/schedule.controller';
import { ScheduleGeneratorService } from './services/schedule-generator.service';
import { ScheduleValidationService } from './services/schedule-validation.service';
import { ScheduleAlgorithmService } from './services/schedule-algorithm.service';
import { TournamentMatchGenerationService } from './services/tournament-match-generation.service';
import { ScheduleModule } from './schedule.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    TournamentAccessModule,
    ScheduleModule,
  ],
  controllers: [
    TournamentsController,
    TournamentPlayersController,
    TournamentPairsController,
    ScheduleGeneratorController,
  ],
  providers: [
    TournamentsService,
    ScheduleGeneratorService,
    ScheduleValidationService,
    ScheduleAlgorithmService,
    TournamentMatchGenerationService,
  ],
  exports: [TournamentsService, ScheduleModule],
})
export class TournamentsModule {}
