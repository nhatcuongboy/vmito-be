import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SessionExpensesService } from './session-expenses.service';
import { CreateSessionExpenseDto } from './dto/create-session-expense.dto';
import { UpdateSessionExpenseDto } from './dto/update-session-expense.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('session-expenses')
@ApiBearerAuth('JWT-auth')
@Controller('sessions/:sessionId/expenses')
@UseGuards(JwtAuthGuard)
export class SessionExpensesController {
  constructor(private readonly expensesService: SessionExpensesService) {}

  @Get()
  findAll(@Param('sessionId') sessionId: string) {
    return this.expensesService.findAll(sessionId);
  }

  @Post()
  create(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateSessionExpenseDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.expensesService.create(sessionId, dto, user.userId, user.role);
  }

  @Patch(':expenseId')
  update(
    @Param('sessionId') sessionId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateSessionExpenseDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.expensesService.update(
      sessionId,
      expenseId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('sessionId') sessionId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.expensesService.remove(
      sessionId,
      expenseId,
      user.userId,
      user.role
    );
  }
}
