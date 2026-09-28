import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryFilterPresetsController } from './discovery-filter-presets.controller';
import { DiscoveryFilterPresetsService } from './discovery-filter-presets.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiscoveryFilterPresetsController],
  providers: [DiscoveryFilterPresetsService],
})
export class DiscoveryFilterPresetsModule {}
