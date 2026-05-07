import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TournamentsService } from './tournaments.service';
import { UpdateTournamentPlayerDto } from './dto/create-tournament-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

interface CurrentUserPayload {
  userId: string;
  role?: string;
}

@ApiTags('tournament-players')
@ApiBearerAuth('JWT-auth')
@Controller('tournament-players')
@UseGuards(JwtAuthGuard)
export class TournamentPlayersController {
  constructor(private readonly service: TournamentsService) {}

  @Public()
  @Get(':id')
  getPlayer(@Param('id') id: string) {
    return this.service.getPlayer(id);
  }

  @Public()
  @Get(':id/matches')
  getPlayerMatches(@Param('id') id: string) {
    return this.service.getPlayerMatches(id);
  }

  @Put(':id')
  updatePlayer(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentPlayerDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.service.updatePlayer(id, dto, user.userId, user.role);
  }

  @Delete(':id')
  deletePlayer(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.service.deletePlayer(id, user.userId, user.role);
  }
}
