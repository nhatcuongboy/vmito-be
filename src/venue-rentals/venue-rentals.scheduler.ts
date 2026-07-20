import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VenueRentalsService } from './venue-rentals.service';

@Injectable()
export class VenueRentalsScheduler {
  constructor(private readonly service: VenueRentalsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  processLifecycle() {
    return this.service.processLifecycle();
  }
}
