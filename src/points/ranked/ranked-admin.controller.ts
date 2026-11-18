import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { HonorReviewService } from './honor-review.service';
import { RankedMatchService } from './ranked-match.service';
import { RankedMatchesQueryService } from './ranked-matches-query.service';
import {
  AdminPageQueryDto,
  AdminRankedMatchesQueryDto,
  GenerateHonorReviewDto,
  HonorEntryDecisionDto,
  ReviewMatchDto,
} from './dto/ranked.dto';

type AuthUser = { userId: string };

@ApiTags('ranked-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/ranked')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RankedAdminController {
  constructor(
    private readonly honorReviews: HonorReviewService,
    private readonly rankedMatches: RankedMatchService,
    private readonly matchesQuery: RankedMatchesQueryService
  ) {}

  @Get('honor-reviews')
  @ApiOperation({ summary: 'Admin: honor reviews, newest first' })
  listReviews(@Query() query: AdminPageQueryDto) {
    return this.honorReviews.list(query.page, query.limit);
  }

  @Post('honor-reviews')
  @ApiOperation({
    summary: 'Admin: (re)generate a DRAFT honor review for a period',
  })
  generate(@Body() dto: GenerateHonorReviewDto) {
    return this.honorReviews.generate(
      dto.sport ?? 'BADMINTON',
      dto.period,
      dto.periodKey
    );
  }

  @Get('honor-reviews/:id')
  @ApiOperation({
    summary: 'Admin: honor review with entries and fraud signals',
  })
  getReview(@Param('id') id: string) {
    return this.honorReviews.get(id);
  }

  @Patch('honor-reviews/:id/entries/:entryId')
  @ApiOperation({ summary: 'Admin: approve or exclude a player' })
  decide(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: HonorEntryDecisionDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.honorReviews.decide(id, entryId, dto, user.userId);
  }

  @Post('honor-reviews/:id/publish')
  @ApiOperation({ summary: 'Admin: publish the approved honor list' })
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.honorReviews.publish(id, user.userId);
  }

  @Get('matches')
  @ApiOperation({
    summary:
      'Admin: ranked matches to review (default DISPUTED; filter by status/user/session)',
  })
  listMatches(@Query() query: AdminRankedMatchesQueryDto) {
    return this.matchesQuery.listForAdmin(query);
  }

  @Patch('matches/:matchId')
  @ApiOperation({ summary: 'Admin: count (VERIFIED) or reject a match' })
  reviewMatch(
    @Param('matchId') matchId: string,
    @Body() dto: ReviewMatchDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.rankedMatches.adminReview(
      matchId,
      dto.status,
      user.userId,
      dto.note
    );
  }
}
