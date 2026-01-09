import {
  Controller,
  Get,
  Post,
  Patch,
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

@ApiTags('matches')
@ApiBearerAuth('JWT-auth')
@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMatchDto: UpdateMatchDto) {
    return this.matchesService.update(id, updateMatchDto);
  }
}

// Session Matches Controller - for endpoints under /sessions/:sessionId/matches
@Controller('sessions/:sessionId/matches')
@UseGuards(JwtAuthGuard)
export class SessionMatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  findBySession(
    @Param('sessionId') sessionId: string,
    @Query('playerId') playerId?: string,
    @Query('courtId') courtId?: string
  ) {
    return this.matchesService.findBySession(sessionId, { playerId, courtId });
  }

  @Post()
  create(
    @Param('sessionId') sessionId: string,
    @Body() createMatchDto: CreateMatchDto
  ) {
    return this.matchesService.createMatch(
      sessionId,
      createMatchDto.courtId,
      createMatchDto.playerIds
    );
  }
}
