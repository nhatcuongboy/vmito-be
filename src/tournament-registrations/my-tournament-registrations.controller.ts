import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { ListMyRegistrationsDto } from './dto/review-registration.dto';

/**
 * The caller's registration requests across all tournaments. Its own prefix
 * because `tournaments/:tournamentId/...` would read "me" as a tournament id.
 * Cancelling still goes through `DELETE tournaments/:id/registrations/:id`.
 */
@ApiTags('tournament-registrations')
@ApiBearerAuth('JWT-auth')
@Controller('tournament-registrations')
@UseGuards(JwtAuthGuard)
export class MyTournamentRegistrationsController {
  constructor(private readonly registrations: TournamentRegistrationsService) {}

  @Get('me')
  @ApiOperation({
    summary: "Current user's registration requests across all tournaments",
  })
  listAllMine(
    @Query() query: ListMyRegistrationsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registrations.listAllMine(user.userId, query.status);
  }
}
