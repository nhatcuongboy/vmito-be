import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TournamentManagersService } from './tournament-managers.service';
import { CreateTournamentManagerDto } from './dto/create-tournament-manager.dto';
import { UpdateTournamentManagerDto } from './dto/update-tournament-manager.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tournament-managers')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments/:tournamentId/managers')
@UseGuards(JwtAuthGuard)
export class TournamentManagersController {
  constructor(private readonly managers: TournamentManagersService) {}

  @Get()
  list(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.list(tournamentId, user.userId, user.role);
  }

  @Post()
  add(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateTournamentManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.add(tournamentId, dto, user.userId, user.role);
  }

  @Patch(':userId')
  updatePermissions(
    @Param('tournamentId') tournamentId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateTournamentManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.updatePermissions(
      tournamentId,
      targetUserId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete(':userId')
  remove(
    @Param('tournamentId') tournamentId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.remove(
      tournamentId,
      targetUserId,
      user.userId,
      user.role
    );
  }
}
