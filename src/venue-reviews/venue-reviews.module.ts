import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VenueReviewsController } from './venue-reviews.controller';
import { VenueReviewsAdminController } from './venue-reviews-admin.controller';
import { VenueReviewsService } from './venue-reviews.service';
import { VenueReviewsAdminService } from './venue-reviews-admin.service';

@Module({
  imports: [PrismaModule],
  controllers: [VenueReviewsController, VenueReviewsAdminController],
  providers: [VenueReviewsService, VenueReviewsAdminService],
})
export class VenueReviewsModule {}
