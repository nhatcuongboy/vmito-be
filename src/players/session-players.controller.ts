import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlayersService } from './players.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sessions/:sessionId/players')
@UseGuards(JwtAuthGuard)
export class SessionPlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Post()
  createPlayer(
    @Param('sessionId') sessionId: string,
    @Body() createPlayerDto: CreatePlayerDto
  ) {
    return this.playersService.createInSession(sessionId, createPlayerDto);
  }

  @Post('bulk')
  createBulkPlayers(
    @Param('sessionId') sessionId: string,
    @Body() playersData: CreatePlayerDto[]
  ) {
    return this.playersService.createBulkInSession(sessionId, playersData);
  }
}
