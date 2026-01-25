import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PlayersService } from './players.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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

  @Post('register')
  registerPlayers(
    @Param('sessionId') sessionId: string,
    @Body() body: { players: CreatePlayerDto[] },
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.playersService.registerPlayers(
      sessionId,
      user.userId,
      body.players,
      user.role
    );
  }

  @Patch(':playerId/status')
  updatePlayerStatus(
    @Param('sessionId') sessionId: string,
    @Param('playerId') playerId: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED' },
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.playersService.updatePlayerStatus(
      sessionId,
      playerId,
      body.status,
      user.userId,
      user.role
    );
  }
}
