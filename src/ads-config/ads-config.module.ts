import { Module } from '@nestjs/common';
import { AdsConfigController } from './ads-config.controller';
import { AdsConfigService } from './ads-config.service';

@Module({
  controllers: [AdsConfigController],
  providers: [AdsConfigService],
})
export class AdsConfigModule {}
