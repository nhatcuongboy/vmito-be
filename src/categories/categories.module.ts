import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentsGatewayModule } from '../tournaments/realtime/tournaments-gateway.module';
import { TournamentAccessModule } from '../common/tournament-access/tournament-access.module';
import { ScheduleModule } from '../tournaments/schedule.module';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    PrismaModule,
    TournamentsGatewayModule,
    TournamentAccessModule,
    ScheduleModule,
    PointsModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
