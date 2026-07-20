import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AddressMappingService } from './address-mapping.service';
import { FavoritesModule } from '../favorites/favorites.module';
import { VenuePricingService } from '../venue-rentals/venue-pricing.service';
import { VenueAccessService } from './venue-access.service';

@Module({
  imports: [PrismaModule, FavoritesModule],
  controllers: [VenuesController],
  providers: [
    VenuesService,
    AddressMappingService,
    VenuePricingService,
    VenueAccessService,
  ],
  exports: [
    VenuesService,
    AddressMappingService,
    VenuePricingService,
    VenueAccessService,
  ],
})
export class VenuesModule {}
