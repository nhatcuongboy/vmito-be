import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { HostReportController } from './reports/host-report.controller';
import { HostReportService } from './reports/host-report.service';
import { MyUnpaidPaymentsService } from './my-unpaid-payments.service';
import { SessionAccessModule } from '../common/session-access/session-access.module';

@Module({
  imports: [PrismaModule, SessionAccessModule],
  controllers: [PaymentsController, HostReportController],
  providers: [PaymentsService, HostReportService, MyUnpaidPaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
