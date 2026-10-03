import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  CreateSessionVideoDto,
  MyMatchClipsQueryDto,
} from './session-videos.dto';
import { SessionVideosService } from './session-videos.service';

// Routes live on the root controller so the host routes can sit under
// /sessions/:id while the player feed gets its own prefix — /players/me/... or
// /sessions/me/... would race the existing `:id` param routes.
@ApiTags('session-videos')
@ApiBearerAuth('JWT-auth')
@Controller()
export class SessionVideosController {
  constructor(private readonly service: SessionVideosService) {}

  @Get('sessions/:sessionId/videos')
  @ApiOperation({
    summary: 'List match clips of a session (host or approved player)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string
  ) {
    return this.service.list(sessionId, user.userId, user.role);
  }

  @Post('sessions/:sessionId/videos')
  @ApiOperation({ summary: 'Add a match clip link to a session (host only)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateSessionVideoDto
  ) {
    return this.service.create(sessionId, dto, user.userId, user.role);
  }

  @Delete('sessions/:sessionId/videos/:videoId')
  @ApiOperation({ summary: 'Remove a match clip from a session (host only)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Param('videoId') videoId: string
  ) {
    return this.service.remove(sessionId, videoId, user.userId, user.role);
  }

  @Get('session-videos/mine')
  @ApiOperation({
    summary: 'Match clips of the sessions the current user played in',
  })
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyMatchClipsQueryDto
  ) {
    return this.service.mine(user.userId, query.page ?? 1, query.limit ?? 10);
  }
}
