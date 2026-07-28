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

@Module({
  imports: [PrismaModule, NotificationsModule, VenuesModule],
  controllers: [
    VenueRentalsController,
    VenueRentalVenuesController,
    VenueCourtsController,
  ],
  providers: [
    VenueRentalsService,
    VenueRentalPaymentsService,
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
