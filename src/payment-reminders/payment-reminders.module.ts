import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentRemindersController } from './payment-reminders.controller';
import { PaymentRemindersService } from './payment-reminders.service';
import { SessionAccessModule } from '../common/session-access/session-access.module';

@Module({
  imports: [
    PrismaModule,
    PaymentsModule,
    NotificationsModule,
    SessionAccessModule,
  ],
  controllers: [PaymentRemindersController],
  providers: [PaymentRemindersService],
})
export class PaymentRemindersModule {}
