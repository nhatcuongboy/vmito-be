import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { HostAwardsQueryService } from './host-awards-query.service';
import { MonthKeyParamDto } from './dto/host-awards.dto';

@ApiTags('host-awards')
@ApiBearerAuth('JWT-auth')
@Controller('host-awards')
@UseGuards(JwtAuthGuard)
export class HostAwardsController {
  constructor(private readonly query: HostAwardsQueryService) {}

  @Public()
  @Get('current')
  @ApiOperation({
    summary: 'Live provisional host board for the running month',
  })
  getCurrent() {
    return this.query.getBoard();
  }

  @Public()
  @Get('periods')
  @ApiOperation({ summary: 'Running month plus published months to browse' })
  getPeriods() {
    return this.query.getPeriods();
  }

  @Get('me/progress')
  @ApiOperation({
    summary: "Current user's progress toward this month's awards",
  })
  getMyProgress(@CurrentUser() user: { userId: string }) {
    return this.query.getMyProgress(user.userId);
  }

  @Public()
  @Get('users/:userId/badges')
  @ApiOperation({ summary: 'Published host award badges of a user' })
  getUserBadges(@Param('userId') userId: string) {
    return this.query.getUserBadges(userId);
  }

  @Public()
  @Get(':monthKey')
  @ApiOperation({ summary: 'Published host awards of a month (YYYY-MM)' })
  getMonth(@Param() params: MonthKeyParamDto) {
    return this.query.getBoard(params.monthKey);
  }
}
