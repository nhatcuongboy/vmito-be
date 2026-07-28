import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VenueRentalsService } from './venue-rentals.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';

@Injectable()
export class VenueRentalsScheduler {
  constructor(
    private readonly service: VenueRentalsService,
    private readonly payments: VenueRentalPaymentsService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processLifecycle() {
    const rentals = await this.service.processLifecycle();
    const payments = await this.payments.processLifecycle();
    return { rentals, payments };
  }
}
