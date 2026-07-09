import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentsGatewayModule } from './realtime/tournaments-gateway.module';
import { ScheduleService } from './services/schedule.service';

/**
 * Standalone module for the runtime "Next Available Court" scheduling service.
 *
 * ScheduleService depends only on Prisma, so it lives in its own module to be
 * shared by both TournamentsModule (HTTP endpoints) and CategoriesModule
 * (auto-assign-on-match-finish hook) without creating a circular module
 * dependency between those two.
 */
@Module({
  imports: [PrismaModule, TournamentsGatewayModule],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
