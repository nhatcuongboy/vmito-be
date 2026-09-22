import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { TournamentRegistrationReviewService } from './tournament-registration-review.service';
import {
  ListRegistrationRequestsDto,
  ReviewRegistrationDto,
} from './dto/review-registration.dto';

@ApiTags('tournament-registrations')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments/:tournamentId/registration-requests')
@UseGuards(JwtAuthGuard)
export class TournamentRegistrationReviewController {
  constructor(private readonly review: TournamentRegistrationReviewService) {}

  @Get()
  @ApiOperation({ summary: 'Organizer: list registration requests' })
  list(
    @Param('tournamentId') tournamentId: string,
    @Query() query: ListRegistrationRequestsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.review.list(tournamentId, query, user.userId, user.role);
  }

  @Post(':requestId/approve')
  @ApiOperation({ summary: 'Organizer: approve and add to the category' })
  approve(
    @Param('tournamentId') tournamentId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewRegistrationDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.review.approve(
      tournamentId,
      requestId,
      dto,
      user.userId,
      user.role
    );
  }

  @Post(':requestId/reject')
  @ApiOperation({ summary: 'Organizer: reject a registration request' })
  reject(
    @Param('tournamentId') tournamentId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewRegistrationDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.review.reject(
      tournamentId,
      requestId,
      dto,
      user.userId,
      user.role
    );
  }
}
