import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ClubReviewsQueryDto, SaveClubReviewDto } from './dto/club-review.dto';
import { ClubReviewsService } from './club-reviews.service';

@ApiTags('club-reviews')
@ApiBearerAuth('JWT-auth')
@Controller('clubs/:id/reviews')
@UseGuards(JwtAuthGuard)
export class ClubReviewsController {
  constructor(private readonly reviewsService: ClubReviewsService) {}

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get()
  @ApiOperation({
    summary: 'List VISIBLE reviews of a public club (id or slug)',
  })
  list(@Param('id') id: string, @Query() query: ClubReviewsQueryDto) {
    return this.reviewsService.list(id, query.page, query.limit);
  }

  @Get('me')
  @ApiOperation({ summary: "The caller's own VISIBLE review, or null" })
  findMine(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.findMine(id, user.userId);
  }

  @Get('eligibility')
  @ApiOperation({
    summary: 'Whether the caller (active non-host member) can review',
  })
  eligibility(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.getEligibility(id, user.userId);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Review a club (active members only, one review per user)',
  })
  create(
    @Param('id') id: string,
    @Body() dto: SaveClubReviewDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.create(id, dto, user);
  }

  @Patch(':reviewId')
  @ApiOperation({ summary: 'Edit own review' })
  update(
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: SaveClubReviewDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.update(id, reviewId, dto, user);
  }

  @Delete(':reviewId')
  @ApiOperation({ summary: 'Delete own review (or any review as ADMIN)' })
  remove(
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.remove(id, reviewId, user);
  }
}
