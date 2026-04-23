import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AddressMappingService } from './address-mapping.service';

@Module({
  imports: [PrismaModule],
  controllers: [VenuesController],
  providers: [VenuesService, AddressMappingService],
  exports: [VenuesService, AddressMappingService],
})
export class VenuesModule {}
