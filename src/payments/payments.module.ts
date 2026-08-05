import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { HostReportController } from './reports/host-report.controller';
import { HostReportService } from './reports/host-report.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController, HostReportController],
  providers: [PaymentsService, HostReportService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
