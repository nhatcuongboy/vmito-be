import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CostSplitService } from './cost-split.service';
import { ApplyCostSplitDto } from './dto/apply-cost-split.dto';

@ApiTags('payments')
@ApiBearerAuth('JWT-auth')
@Controller('sessions/:sessionId/payments/split')
@UseGuards(JwtAuthGuard)
export class CostSplitController {
  constructor(private readonly service: CostSplitService) {}

  @Get('context')
  @ApiOperation({ summary: 'Expenses and players for the cost split page' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  getContext(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.getContext(sessionId, user.userId, user.role);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Split session expenses and bill the players' })
  @ApiResponse({ status: 400, description: 'Nothing to split' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  @ApiResponse({ status: 409, description: 'Preview is out of date' })
  apply(
    @Param('sessionId') sessionId: string,
    @Body() dto: ApplyCostSplitDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.apply(sessionId, dto, user.userId, user.role);
  }
}
