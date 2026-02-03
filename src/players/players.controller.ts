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

  // ============ Public Endpoints (must come before :id routes) ============

  @Public()
  @Get('check-code')
  @ApiOperation({ summary: 'Check if code is player code or session code' })
  checkCode(@Query('code') code: string) {
    return this.playersService.checkCode(code);
  }

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

  @Public()
  @Get('guest/:id')
  @ApiOperation({ summary: 'Get player info for guest confirm flow' })
  getPlayerForGuest(@Param('id') id: string) {
    return this.playersService.getPlayerForGuest(id);
  }

  @Public()
  @Get('guest/:id/status')
  @ApiOperation({ summary: 'Get player status with joinCode verification' })
  getPlayerStatusById(@Param('id') id: string, @Query('code') code: string) {
    return this.playersService.getPlayerStatusById(id, code);
  }

  // ============ Authenticated Endpoints ============

  @Get('pending-requests')
  @ApiOperation({ summary: 'Get pending player requests for host' })
  getPendingRequests(@CurrentUser() user: { userId: string; role: string }) {
    return this.playersService.findPendingRequests(user.userId, user.role);
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

  @Get('me/registrations')
  @ApiOperation({
    summary: 'Get current user registration status across all sessions',
  })
  getMyRegistrations(@CurrentUser() user: { userId: string }) {
    if (!user || typeof user.userId !== 'string') {
      throw new Error('Invalid user object');
    }
    return this.playersService.getUserRegistrations(user.userId);
  }

  @Post('link-account')
  linkAccount(@Body() body: { playerId: string; userId: string }) {
    return this.playersService.linkAccount(body.playerId, body.userId);
  }

  // ============ Parameterized Routes (must come last) ============

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

  @Public()
  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm player info (guest)' })
  confirm(@Param('id') id: string, @Body() confirmPlayerDto: ConfirmPlayerDto) {
    return this.playersService.confirm(id, confirmPlayerDto);
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

  @Get('bulk')
  @ApiOperation({ summary: 'Get bulk players info for a session' })
  getBulkPlayersInfo(@Param('sessionId') sessionId: string) {
    return this.playersService.getBulkPlayersInfo(sessionId);
  }

  @Patch('bulk-update')
  @ApiOperation({ summary: 'Bulk update players in a session' })
  bulkUpdatePlayers(
    @Param('sessionId') sessionId: string,
    @Body() body: { players: UpdatePlayerInSessionDto[] }
  ) {
    return this.playersService.bulkUpdatePlayers(sessionId, body.players);
  }

  @Post('register')
  register(
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

  @Patch('toggle-inactive')
  toggleInactive(
    @Param('sessionId') sessionId: string,
    @Body() body: { playerId: string }
  ) {
    return this.playersService.toggleInactive(sessionId, body.playerId);
  }

  @Patch(':playerId/status')
  @ApiOperation({ summary: 'Approve or reject a player registration' })
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

  @Get('me')
  @ApiOperation({
    summary: "Get current user's registered players for this session",
  })
  getMyPlayersForSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string }
  ) {
    if (!user || typeof user.userId !== 'string') {
      throw new Error('Invalid user object');
    }
    return this.playersService.getMyPlayersForSession(sessionId, user.userId);
  }

  @Public()
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
