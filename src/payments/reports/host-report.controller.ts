import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { HostReportQueryDto } from './dto';
import { HostReportService } from './host-report.service';

@ApiTags('payments')
@ApiBearerAuth('JWT-auth')
@Controller('payments/host')
@UseGuards(JwtAuthGuard)
export class HostReportController {
  constructor(private readonly service: HostReportService) {}

  @Get('report')
  @ApiOperation({
    summary:
      'Income, expense and net settlement report for the current host over a date range',
  })
  @ApiOkResponse({ description: 'Host finance report' })
  getReport(
    @Query() query: HostReportQueryDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.getReport(user.userId, query);
  }
}
