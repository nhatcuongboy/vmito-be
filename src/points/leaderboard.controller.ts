import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LeaderboardService } from './leaderboard.service';
import { PointsBackfillService } from './points-backfill.service';
import { PointsAdminService } from './points-admin.service';
import {
  AchievementsQueryDto,
  LeaderboardQueryDto,
  PointTransactionsQueryDto,
} from './dto/leaderboard-query.dto';
import { RankedLeaderboardService } from './ranked/ranked-leaderboard.service';
import { HonorReviewService } from './ranked/honor-review.service';
import { HonorQueryDto, RankedMeQueryDto } from './ranked/dto/ranked.dto';

@ApiTags('leaderboard')
@ApiBearerAuth('JWT-auth')
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly backfillService: PointsBackfillService,
    private readonly pointsAdminService: PointsAdminService,
    private readonly rankedLeaderboard: RankedLeaderboardService,
    private readonly honorReviews: HonorReviewService
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Ranked leaderboard for a sport and time period' })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    const { board, ...rest } = query;
    if (board === 'ranked') return this.rankedLeaderboard.getLeaderboard(rest);
    return this.leaderboardService.getLeaderboard({ ...rest, board });
  }

  @Get('ranked/me')
  @ApiOperation({
    summary: "Current user's verified ranking and progress to eligibility",
  })
  getMyRanked(
    @CurrentUser() user: { userId: string },
    @Query() query: RankedMeQueryDto
  ) {
    return this.rankedLeaderboard.getMine(user.userId, query);
  }

  @Public()
  @Get('honors')
  @ApiOperation({ summary: 'Published honor list for a sport and period' })
  getHonors(@Query() query: HonorQueryDto) {
    return this.honorReviews.getPublished(query);
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

  @Public()
  @Get('users/:userId/point-transactions')
  @ApiOperation({
    summary: "Paginated point history for a user's achievements",
  })
  getUserPointTransactions(
    @Param('userId') userId: string,
    @Query() query: PointTransactionsQueryDto
  ) {
    return this.leaderboardService.getUserPointTransactions(userId, query);
  }

  @UseGuards(AdminGuard)
  @Get('admin/overview')
  @ApiOperation({ summary: 'Admin: scoring config and points system stats' })
  getAdminOverview(@Query() query: AchievementsQueryDto) {
    return this.pointsAdminService.getOverview(query.sport);
  }

  @UseGuards(AdminGuard)
  @Post('backfill')
  @ApiOperation({ summary: 'Admin: recompute points from historical results' })
  backfill() {
    return this.backfillService.backfillAll();
  }
}
