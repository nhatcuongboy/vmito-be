import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { UpdateMatchDto } from './dto/update-match.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAccessService } from '../common/session-access/session-access.service';

@ApiTags('matches')
@ApiBearerAuth('JWT-auth')
@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly sessionAccess: SessionAccessService
  ) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMatchDto: UpdateMatchDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertMatchSessionHost(id, user.userId, user.role);
    return this.matchesService.update(id, updateMatchDto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertMatchSessionHost(id, user.userId, user.role);
    return this.matchesService.remove(id);
  }
}

// Session Matches Controller - for endpoints under /sessions/:sessionId/matches
@Controller('sessions/:sessionId/matches')
@UseGuards(JwtAuthGuard)
export class SessionMatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly sessionAccess: SessionAccessService
  ) {}

  @Public()
  @Get()
  findBySession(
    @Param('sessionId') sessionId: string,
    @Query('playerId') playerId?: string,
    @Query('courtId') courtId?: string
  ) {
    return this.matchesService.findBySession(sessionId, { playerId, courtId });
  }

  @Post()
  async create(
    @Param('sessionId') sessionId: string,
    @Body() createMatchDto: CreateMatchDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(
      sessionId,
      user.userId,
      user.role
    );
    return this.matchesService.createMatch(
      sessionId,
      createMatchDto.courtId,
      createMatchDto.playerIds
    );
  }
}
