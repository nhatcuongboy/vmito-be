import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LeaderboardService } from './leaderboard.service';
import { PointsBackfillService } from './points-backfill.service';
import {
  AchievementsQueryDto,
  LeaderboardQueryDto,
} from './dto/leaderboard-query.dto';

@ApiTags('leaderboard')
@ApiBearerAuth('JWT-auth')
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly backfillService: PointsBackfillService
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Ranked leaderboard for a sport and time period' })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(query);
  }

  @Get('me')
  @ApiOperation({ summary: "Current user's rank for every period" })
  getMyRanks(
    @CurrentUser() user: { userId: string },
    @Query() query: AchievementsQueryDto
  ) {
    return this.leaderboardService.getMyRanks(user.userId, query.sport);
  }

  @Public()
  @Get('users/:userId/achievements')
  @ApiOperation({ summary: 'Public achievements summary for a user' })
  getUserAchievements(
    @Param('userId') userId: string,
    @Query() query: AchievementsQueryDto
  ) {
    return this.leaderboardService.getUserAchievements(userId, query.sport);
  }

  @UseGuards(AdminGuard)
  @Post('backfill')
  @ApiOperation({ summary: 'Admin: recompute points from historical results' })
  backfill() {
    return this.backfillService.backfillAll();
  }
}
