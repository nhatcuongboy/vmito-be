import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SaveTournamentPairDto } from './dto/tournament-pair.dto';
import { TournamentsService } from './tournaments.service';

interface CurrentUserPayload {
  userId: string;
  role?: string;
}

@ApiTags('tournament-pairs')
@ApiBearerAuth('JWT-auth')
@Controller('tournament-pairs')
@UseGuards(JwtAuthGuard)
export class TournamentPairsController {
  constructor(private readonly service: TournamentsService) {}

  @Public()
  @Get(':id')
  getPair(@Param('id') id: string) {
    return this.service.getPair(id);
  }

  @Public()
  @Get(':id/matches')
  getPairMatches(@Param('id') id: string) {
    return this.service.getPairMatches(id);
  }

  @Put(':id')
  updatePair(
    @Param('id') id: string,
    @Body() dto: SaveTournamentPairDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.service.updatePair(id, dto, user.userId, user.role);
  }

  @Delete(':id')
  deletePair(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deletePair(id, user.userId, user.role);
  }
}
