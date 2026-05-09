import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentPlayersController } from './tournament-players.controller';
import { TournamentsService } from './tournaments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoriesModule } from '../categories/categories.module';
import { ScheduleGeneratorController } from './controllers/schedule.controller';
import { ScheduleGeneratorService } from './services/schedule-generator.service';
import { ScheduleValidationService } from './services/schedule-validation.service';
import { ScheduleAlgorithmService } from './services/schedule-algorithm.service';
import { ScheduleService } from './services/schedule.service';

@Module({
  imports: [PrismaModule, CategoriesModule],
  controllers: [
    TournamentsController,
    TournamentPlayersController,
    ScheduleGeneratorController,
  ],
  providers: [
    TournamentsService,
    ScheduleService,
    ScheduleGeneratorService,
    ScheduleValidationService,
    ScheduleAlgorithmService,
  ],
  exports: [TournamentsService, ScheduleService],
})
export class TournamentsModule {}
