import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { ActivitiesModule } from '../activities/activities.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [
    PrismaModule,
    FavoritesModule,
    RecommendationsModule,
    ActivitiesModule,
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
