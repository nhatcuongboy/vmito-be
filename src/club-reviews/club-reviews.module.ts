import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubReviewsController } from './club-reviews.controller';
import { ClubReviewsAdminController } from './club-reviews-admin.controller';
import { ClubReviewsService } from './club-reviews.service';
import { ClubReviewsAdminService } from './club-reviews-admin.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClubReviewsController, ClubReviewsAdminController],
  providers: [ClubReviewsService, ClubReviewsAdminService],
})
export class ClubReviewsModule {}
