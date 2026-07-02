import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Header,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateWaitTimesDto } from './dto/update-wait-times.dto';
import { BulkSessionCreationDto } from './dto/bulk-session.dto';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';
import { SessionSuggestionsQueryDto } from './dto/session-suggestions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { SessionStatus } from '@prisma/client';

@ApiTags('sessions')
@ApiBearerAuth('JWT-auth')
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private configService: ConfigService
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: { userId: string; role: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('hostId') hostId?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('status') status?: SessionStatus,
    @Query('excludeStatus') excludeStatus?: SessionStatus,
    @Query('excludeStatuses') excludeStatusesRaw?: string,
    @Query('endTimeBefore') endTimeBefore?: string,
    @Query('endTimeAfter') endTimeAfter?: string
  ) {
    // Security: non-admin users can only see their own hosted sessions
    const effectiveHostId = user.role === 'ADMIN' ? hostId : user.userId;
    const excludeStatuses = excludeStatusesRaw
      ? (excludeStatusesRaw.split(',') as SessionStatus[])
      : undefined;

    return this.sessionsService.findAll(user, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      hostId: effectiveHostId,
      searchQuery,
      sortBy,
      sortOrder,
      status,
      excludeStatus,
      excludeStatuses,
      endTimeBefore,
      endTimeAfter,
    });
  }

  @Public()
  @Get('public')
  getPublicSessions(
    @Query('hostId') hostId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: SessionStatus,
    @Query('excludeStatus') excludeStatus?: SessionStatus,
    @Query('excludeStatuses') excludeStatusesRaw?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc'
  ) {
    const excludeStatuses = excludeStatusesRaw
      ? (excludeStatusesRaw.split(',') as SessionStatus[])
      : undefined;
    return this.sessionsService.getPublicSessions(hostId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      excludeStatus,
      excludeStatuses,
      sortBy,
      sortOrder,
    });
  }

  @Public()
  @Get('available')
  getAvailable(
    @Query('date') date?: string,
    @Query('level') level?: number,
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('venueId') venueId?: string,
    @Query('minFee') minFee?: string,
    @Query('maxFee') maxFee?: string,
    @Query('hasSlots') hasSlots?: string,
    @Query('minAvailableSlots') minAvailableSlots?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('sortByDistance') sortByDistance?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('hostId') hostId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc'
  ) {
    return this.sessionsService.findAvailable({
      date,
      level,
      city,
      district,
      venueId,
      minFee: minFee ? parseFloat(minFee) : undefined,
      maxFee: maxFee ? parseFloat(maxFee) : undefined,
      hasSlots:
        hasSlots === 'true' ? true : hasSlots === 'false' ? false : undefined,
      minAvailableSlots: minAvailableSlots
        ? parseInt(minAvailableSlots, 10)
        : undefined,
      searchQuery,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      sortByDistance: sortByDistance === 'true',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      hostId,
      sortBy,
      sortOrder,
    });
  }

  @ApiOperation({
    summary: 'Get personalized session suggestions',
    description:
      'Returns rule-based personalized suggestions using level, distance, schedule history, familiar venues, favorite hosts, and available slots.',
  })
  @ApiQuery({
    name: 'favoriteHostOnly',
    required: false,
    description:
      'When true, only suggest sessions from hosts the user frequently joins.',
    example: false,
  })
  @Get('suggestions')
  getSuggestions(
    @CurrentUser() user: { userId: string; role: string },
    @Query() query: SessionSuggestionsQueryDto
  ) {
    return this.sessionsService.getSuggestions(user.userId, query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Public()
  @Get(':id/recommendations')
  @ApiOperation({
    summary: 'Get session recommendations',
    description:
      'Get AI-powered session recommendations based on the current session. Returns similar sessions ranked by relevance score considering location, skill level, time, host, and available slots.',
  })
  @ApiParam({
    name: 'id',
    description: 'Session ID',
    example: 'clh1234567890abcdefghij',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 12,
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for personalized recommendations',
    example: 'clh1234567890abcdefghij',
  })
  @ApiResponse({
    status: 200,
    description: 'Recommendations retrieved successfully',
    type: RecommendationResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination parameters',
  })
  async getRecommendations(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string
  ) {
    // Validate pagination parameters
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 12;

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    return this.sessionsService.getSessionRecommendations(id, userId, {
      page: pageNum,
      limit: limitNum,
    });
  }

  @Post()
  create(
    @Body() createSessionDto: CreateSessionDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    if (
      user.role !== 'HOST' &&
      user.role !== 'ADMIN' &&
      user.role !== 'PLAYER' &&
      user.role !== 'REFEREE'
    ) {
      throw new ForbiddenException('Only authorized users can create sessions');
    }
    return this.sessionsService.create(createSessionDto, user.userId);
  }

  @Post('bulk')
  async createBulkSessions(
    @Body() bulkSessionDto: BulkSessionCreationDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    if (
      user.role !== 'HOST' &&
      user.role !== 'ADMIN' &&
      user.role !== 'PLAYER' &&
      user.role !== 'REFEREE'
    ) {
      throw new ForbiddenException('Only authorized users can create sessions');
    }
    return this.sessionsService.createBulkSessions(bulkSessionDto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateSessionDto: UpdateSessionDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.update(
      id,
      updateSessionDto,
      user.userId,
      user.role
    );
  }

  @Delete('bulk')
  async bulkDelete(
    @Body() body: { sessionIds: string[] },
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.bulkDelete(
      body.sessionIds,
      user.userId,
      user.role
    );
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.remove(id, user.userId, user.role);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.sessionsService.start(id);
  }

  @Post(':id/end')
  end(@Param('id') id: string) {
    return this.sessionsService.end(id);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.cancel(id, user.userId, user.role);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.sessionsService.getStatus(id);
  }

  @Patch('bulk/status')
  updateBulkStatus(
    @Body()
    updateBulkStatusDto: import('./dto/update-bulk-status.dto').UpdateBulkStatusDto
  ) {
    return this.sessionsService.updateBulkStatus(
      updateBulkStatusDto.sessionIds,
      updateBulkStatusDto.status
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto
  ) {
    return this.sessionsService.updateStatus(id, updateStatusDto.status);
  }

  @Get(':id/players')
  getPlayers(@Param('id') id: string) {
    return this.sessionsService.getPlayers(id);
  }

  @Get(':id/courts')
  getCourts(@Param('id') id: string) {
    return this.sessionsService.getCourts(id);
  }

  @Public()
  @Get(':id/matches')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  getMatches(
    @Param('id') id: string,
    @Query('playerId') playerId?: string,
    @Query('courtId') courtId?: string
  ) {
    return this.sessionsService.getMatches(id, { playerId, courtId });
  }

  // ============ Phase 3 Missing Endpoints ============

  @Post(':id/auto-assign')
  autoAssign(@Param('id') id: string) {
    return this.sessionsService.autoAssign(id);
  }

  @Get(':id/waiting-queue')
  getWaitingQueue(@Param('id') id: string) {
    return this.sessionsService.getWaitingQueue(id);
  }

  @Put(':id/wait-times')
  updateWaitTimes(
    @Param('id') id: string,
    @Body() updateWaitTimesDto: UpdateWaitTimesDto
  ) {
    return this.sessionsService.updateWaitTimes(id, updateWaitTimesDto);
  }

  @Get(':id/wait-times')
  getWaitTimeStats(@Param('id') id: string) {
    return this.sessionsService.getWaitTimeStats(id);
  }

  @Post(':id/cover-photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCoverPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.sessionsService.uploadCoverPhoto(
      id,
      file,
      user.userId,
      user.role
    );
  }

  @Delete(':id/cover-photo')
  async deleteCoverPhoto(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.deleteCoverPhoto(id, user.userId, user.role);
  }

  @Put(':id/images')
  async updateSessionImages(
    @Param('id') id: string,
    @Body() body: { images: string[]; imagePublicIds: string[] },
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.updateSessionImages(
      id,
      body.images,
      body.imagePublicIds,
      user.userId,
      user.role
    );
  }

  @Put(':id/banner')
  async updateSessionBanner(
    @Param('id') id: string,
    @Body() body: { coverPhoto: string; coverPhotoPublicId: string },
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.sessionsService.updateSessionBanner(
      id,
      body.coverPhoto,
      body.coverPhotoPublicId,
      user.userId,
      user.role
    );
  }
}
