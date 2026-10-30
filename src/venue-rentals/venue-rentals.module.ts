import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VenuesModule } from '../venues/venues.module';
import { VenueRentalsController } from './venue-rentals.controller';
import { VenueRentalVenuesController } from './venue-rental-venues.controller';
import { VenueRentalsScheduler } from './venue-rentals.scheduler';
import { VenueRentalsService } from './venue-rentals.service';
import { VenueCourtsController } from './venue-courts.controller';
import { VenueCourtsService } from './venue-courts.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';
import { VenueRentalReportService } from './venue-rental-report.service';
import { VenueRentalSeriesController } from './venue-rental-series.controller';
import { VenueRentalSeriesService } from './venue-rental-series.service';

@Module({
  imports: [PrismaModule, NotificationsModule, VenuesModule],
  controllers: [
    VenueRentalsController,
    VenueRentalSeriesController,
    VenueRentalVenuesController,
    VenueCourtsController,
  ],
  providers: [
    VenueRentalsService,
    VenueRentalPaymentsService,
    VenueRentalReportService,
    VenueRentalSeriesService,
    VenueRentalsScheduler,
    VenueCourtsService,
  ],
  exports: [
    VenueRentalsService,
    VenueRentalPaymentsService,
    VenueCourtsService,
  ],
})
export class VenueRentalsModule {}
