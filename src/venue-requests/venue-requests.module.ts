import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VenuesModule } from '../venues/venues.module';
import { VenueRequestsController } from './venue-requests.controller';
import { VenueRequestsService } from './venue-requests.service';

@Module({
  imports: [PrismaModule, VenuesModule],
  controllers: [VenueRequestsController],
  providers: [VenueRequestsService],
})
export class VenueRequestsModule {}
