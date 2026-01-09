import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PlayersService } from './players.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { ConfirmPlayerDto } from './dto/confirm-player.dto';
import { UpdatePlayerInSessionDto } from './dto/update-player-in-session.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('players')
@ApiBearerAuth('JWT-auth')
@Controller('players')
@UseGuards(JwtAuthGuard)
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.playersService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updatePlayerDto: UpdatePlayerDto) {
    return this.playersService.update(id, updatePlayerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.playersService.remove(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() confirmPlayerDto: ConfirmPlayerDto) {
    return this.playersService.confirm(id, confirmPlayerDto);
  }

  @Public()
  @Get('check-code')
  checkCode(@Query('code') code: string) {
    return this.playersService.checkCode(code);
  }

  // ============ Guest / Public Endpoints ============

  @Public()
  @Post('join-by-code')
  @ApiOperation({ summary: 'Join session by code (guest)' })
  joinByCode(@Body() joinByCodeDto: JoinByCodeDto) {
    return this.playersService.joinByCode(joinByCodeDto);
  }

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get player status by guest token' })
  getPlayerStatus(@Query('token') token: string) {
    return this.playersService.getPlayerStatus(token);
  }

  // ============ Phase 4 Missing Endpoints ============

  @Post('link-account')
  linkAccount(@Body() body: { playerId: string; userId: string }) {
    return this.playersService.linkAccount(body.playerId, body.userId);
  }

  @Get('me/sessions')
  @ApiOperation({
    summary: 'Get all sessions that the current user has participated in',
  })
  getMySessions(@CurrentUser() user: { userId: string }) {
    if (!user || typeof user.userId !== 'string') {
      throw new Error('Invalid user object');
    }
    return this.playersService.getMySessions(user.userId);
  }
}

// Session Players Controller - for endpoints under /sessions/:id/players
@Controller('sessions/:sessionId/players')
@UseGuards(JwtAuthGuard)
export class SessionPlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Post()
  create(
    @Param('sessionId') sessionId: string,
    @Body() createPlayerDto: CreatePlayerDto
  ) {
    return this.playersService.createInSession(sessionId, createPlayerDto);
  }

  @Post('bulk')
  createBulk(
    @Param('sessionId') sessionId: string,
    @Body() playersData: CreatePlayerDto[]
  ) {
    return this.playersService.createBulkInSession(sessionId, playersData);
  }

  @Patch(':playerId')
  updatePlayerInSession(
    @Param('sessionId') sessionId: string,
    @Param('playerId') playerId: string,
    @Body() updateDto: UpdatePlayerInSessionDto
  ) {
    return this.playersService.updatePlayerInSession(
      sessionId,
      playerId,
      updateDto
    );
  }

  @Delete(':playerId')
  removePlayerFromSession(
    @Param('sessionId') sessionId: string,
    @Param('playerId') playerId: string
  ) {
    return this.playersService.removePlayerFromSession(sessionId, playerId);
  }

  @Get('statistics')
  getPlayerStatistics(
    @Param('sessionId') sessionId: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('gender') gender?: string,
    @Query('level') level?: string,
    @Query('status') status?: string
  ) {
    return this.playersService.getPlayerStatistics(sessionId, {
      sortBy,
      sortOrder,
      gender,
      level,
      status,
    });
  }
}
