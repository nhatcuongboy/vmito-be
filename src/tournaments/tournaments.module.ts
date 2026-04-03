import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentPlayersController } from './tournament-players.controller';
import { TournamentsService } from './tournaments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [PrismaModule, CategoriesModule],
  controllers: [TournamentsController, TournamentPlayersController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
