import { Module } from '@nestjs/common';
import { SessionExpensesController } from './session-expenses.controller';
import { SessionExpensesService } from './session-expenses.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SessionExpensesController],
  providers: [SessionExpensesService],
})
export class SessionExpensesModule {}
