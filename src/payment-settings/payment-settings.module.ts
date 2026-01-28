import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PaymentSettingsController,
  HostPaymentSettingsController,
} from './payment-settings.controller';
import { PaymentSettingsService } from './payment-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentSettingsController, HostPaymentSettingsController],
  providers: [PaymentSettingsService],
  exports: [PaymentSettingsService],
})
export class PaymentSettingsModule {}
