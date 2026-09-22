import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { SubmitRegistrationDto } from './dto/submit-registration.dto';

@ApiTags('tournament-registrations')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments/:tournamentId')
@UseGuards(JwtAuthGuard)
export class TournamentRegistrationsController {
  constructor(private readonly registrations: TournamentRegistrationsService) {}

  @Public()
  @Get('registration-info')
  @ApiOperation({
    summary: 'Whether the tournament and its categories accept registrations',
  })
  getInfo(@Param('tournamentId') tournamentId: string) {
    return this.registrations.getRegistrationInfo(tournamentId);
  }

  @Post('registrations')
  @ApiOperation({ summary: 'Request to join a tournament category' })
  submit(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: SubmitRegistrationDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registrations.submit(tournamentId, dto, user.userId);
  }

  @Get('registrations/me')
  @ApiOperation({
    summary: "Current user's registration requests in this tournament",
  })
  listMine(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registrations.listMine(tournamentId, user.userId);
  }

  @Delete('registrations/:requestId')
  @ApiOperation({ summary: 'Cancel own pending registration request' })
  cancel(
    @Param('tournamentId') tournamentId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.registrations.cancel(tournamentId, requestId, user.userId);
  }
}
