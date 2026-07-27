import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DashboardQueryDto } from './dto';
import { UserStatsService } from './services/user-stats.service';
import { SessionTournamentStatsService } from './services/session-tournament-stats.service';
import { ClubVenueStatsService } from './services/club-venue-stats.service';

@ApiTags('dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class DashboardController {
  constructor(
    private readonly userStatsService: UserStatsService,
    private readonly sessionTournamentStatsService: SessionTournamentStatsService,
    private readonly clubVenueStatsService: ClubVenueStatsService
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'User counts, role breakdown, and signup trend' })
  @ApiOkResponse({ description: 'User statistics' })
  getUserStats(@Query() query: DashboardQueryDto) {
    return this.userStatsService.getStats(query);
  }

  @Get('sessions-tournaments')
  @ApiOperation({
    summary: 'Session and tournament counts, status breakdown, and trend',
  })
  @ApiOkResponse({ description: 'Session and tournament statistics' })
  getSessionTournamentStats(@Query() query: DashboardQueryDto) {
    return this.sessionTournamentStatsService.getStats(query);
  }

  @Get('clubs-venues')
  @ApiOperation({
    summary: 'Club and venue counts, status breakdown, and trend',
  })
  @ApiOkResponse({ description: 'Club and venue statistics' })
  getClubVenueStats(@Query() query: DashboardQueryDto) {
    return this.clubVenueStatsService.getStats(query);
  }
}
