import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentRemindersService } from './payment-reminders.service';
import {
  CreateSingleReminderDto,
  CreateAggregateReminderDto,
  CreateCustomReminderDto,
  MarkReminderPaidDto,
  RejectReminderDto,
  QueryRemindersDto,
} from './dto';

@ApiTags('payment-reminders')
@ApiBearerAuth('JWT-auth')
@Controller('payment-reminders')
@UseGuards(JwtAuthGuard)
export class PaymentRemindersController {
  constructor(private readonly service: PaymentRemindersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reminder for a single pending payment (host)' })
  async createSingle(
    @Body() dto: CreateSingleReminderDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.createSingle(user.userId, dto);
  }

  @Post('aggregate')
  @ApiOperation({
    summary: 'Create or refresh a reminder covering all pending payments for a user (host)',
  })
  async createAggregate(
    @Body() dto: CreateAggregateReminderDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.createOrRefreshAggregate(user.userId, user.role, dto);
  }

  @Post('custom')
  @ApiOperation({ summary: 'Create a freeform custom reminder to any user (host)' })
  async createCustom(
    @Body() dto: CreateCustomReminderDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.createCustom(user.userId, user.role, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List reminders created by or sent to the current user' })
  async list(
    @Query() query: QueryRemindersDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.list(user.userId, query);
  }

  @Post(':id/remind')
  @ApiOperation({ summary: 'Re-send a pending reminder (creator)' })
  async remindAgain(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.remindAgain(id, user.userId);
  }

  @Post(':id/mark-collected')
  @ApiOperation({
    summary: 'Mark reminder as collected/approved (creator, direct or after review)',
  })
  async markCollected(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.markCollected(id, user.userId, user.role);
  }

  @Post(':id/mark-paid')
  @ApiOperation({ summary: 'Mark reminder as paid with proof (recipient)' })
  async markPaid(
    @Param('id') id: string,
    @Body() dto: MarkReminderPaidDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.markPaid(id, user.userId, dto);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject a submitted payment proof, resetting the reminder (creator)',
  })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectReminderDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.reject(id, user.userId, user.role, dto);
  }
}
