import { Module } from '@nestjs/common';
import { SessionExpensesController } from './session-expenses.controller';
import { SessionExpensesService } from './session-expenses.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SessionAccessModule } from '../../common/session-access/session-access.module';

@Module({
  imports: [PrismaModule, SessionAccessModule],
  controllers: [SessionExpensesController],
  providers: [SessionExpensesService],
})
export class SessionExpensesModule {}
