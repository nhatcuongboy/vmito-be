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
import { Public } from '../auth/decorators/public.decorator';
import { RatingsService } from './ratings.service';
import { CreateRatingDto, GetRatingsDto, BatchUserStatsDto } from './dto';

@ApiTags('ratings')
@ApiBearerAuth('JWT-auth')
@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly service: RatingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new rating' })
  @ApiResponse({ status: 201, description: 'Rating created' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 409, description: 'Already rated' })
  async create(
    @Body() dto: CreateRatingDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.service.create(dto, user.userId, user.role);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get ratings with filters' })
  @ApiResponse({ status: 200, description: 'List of ratings' })
  async findMany(@Query() query: GetRatingsDto) {
    return this.service.findMany(query);
  }

  @Get('session/:sessionId/eligibility')
  @ApiOperation({ summary: 'Get rating eligibility for a session' })
  @ApiResponse({ status: 200, description: 'Rating eligibility info' })
  async getSessionEligibility(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.getSessionEligibility(sessionId, user.userId);
  }

  @Public()
  @Post('users/batch-stats')
  @ApiOperation({ summary: 'Get rating statistics for multiple users (batch)' })
  @ApiResponse({ status: 200, description: 'Array of user rating stats' })
  async getBatchUserStats(@Body() dto: BatchUserStatsDto) {
    return this.service.getBatchUserStats(dto.userIds);
  }

  @Public()
  @Get('user/:userId/stats')
  @ApiOperation({ summary: 'Get rating statistics for a user' })
  @ApiResponse({ status: 200, description: 'User rating stats' })
  async getUserStats(@Param('userId') userId: string) {
    return this.service.getUserStats(userId);
  }

  @Public()
  @Get('user/:userId/received')
  @ApiOperation({ summary: 'Get ratings received by a user' })
  @ApiResponse({ status: 200, description: 'List of received ratings' })
  async getUserReceivedRatings(@Param('userId') userId: string) {
    return this.service.getUserReceivedRatings(userId);
  }

  @Public()
  @Get('user/:userId/given')
  @ApiOperation({ summary: 'Get ratings given by a user' })
  @ApiResponse({ status: 200, description: 'List of given ratings' })
  async getUserGivenRatings(@Param('userId') userId: string) {
    return this.service.getUserGivenRatings(userId);
  }
}
