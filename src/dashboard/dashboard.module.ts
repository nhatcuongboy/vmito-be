import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { UserStatsService } from './services/user-stats.service';
import { SessionTournamentStatsService } from './services/session-tournament-stats.service';
import { ClubVenueStatsService } from './services/club-venue-stats.service';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    UserStatsService,
    SessionTournamentStatsService,
    ClubVenueStatsService,
  ],
})
export class DashboardModule {}
