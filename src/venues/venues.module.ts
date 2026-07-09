import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AddressMappingService } from './address-mapping.service';
import { FavoritesModule } from '../favorites/favorites.module';

@Module({
  imports: [PrismaModule, FavoritesModule],
  controllers: [VenuesController],
  providers: [VenuesService, AddressMappingService],
  exports: [VenuesService, AddressMappingService],
})
export class VenuesModule {}
