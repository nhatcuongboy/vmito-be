import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AddressMappingService } from './address-mapping.service';
import { VenueAddressMigrationService } from './venue-address-migration.service';
import { FavoritesModule } from '../favorites/favorites.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { VenuePricingService } from '../venue-rentals/venue-pricing.service';
import { VenueAccessService } from './venue-access.service';
import { VenuePriceImportService } from './venue-price-import.service';
import { VenuePriceImportController } from './venue-price-import.controller';

@Module({
  imports: [PrismaModule, FavoritesModule, RecommendationsModule],
  controllers: [VenuesController, VenuePriceImportController],
  providers: [
    VenuesService,
    AddressMappingService,
    VenueAddressMigrationService,
    VenuePricingService,
    VenueAccessService,
    VenuePriceImportService,
  ],
  exports: [
    VenuesService,
    AddressMappingService,
    VenueAddressMigrationService,
    VenuePricingService,
    VenueAccessService,
  ],
})
export class VenuesModule {}
