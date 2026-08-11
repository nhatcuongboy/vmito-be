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
import { CloneSessionDto } from './dto/clone-session.dto';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';
import { SessionSuggestionsQueryDto } from './dto/session-suggestions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { FeeType, SessionStatus, SportType } from '@prisma/client';
import { SessionAccessService } from '../common/session-access/session-access.service';
import { isSportType } from '../common/utils/sport.utils';

/** Parses a `sportType=BADMINTON,PICKLEBALL` query param. */
const parseSportTypes = (raw?: string): SportType[] | undefined => {
  if (!raw) return undefined;
  const tokens = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (tokens.some((value) => !isSportType(value))) {
    throw new BadRequestException('Invalid sportType');
  }
  const values = tokens.filter(isSportType);
  return values.length > 0 ? values : undefined;
};

const TIME_RANGES = ['morning', 'afternoon', 'evening', 'night'] as const;

const parseCsv = <T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  name: string
): T[] | undefined => {
  if (!raw?.trim()) return undefined;
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.some((value) => !allowed.includes(value as T))) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return [...new Set(values)] as T[];
};

const parseNumber = (
  raw: string | undefined,
  name: string,
  options: { integer?: boolean; min?: number } = {}
): number | undefined => {
  if (raw == null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    (options.min != null && value < options.min)
  ) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return value;
};

const parseLevels = (raw?: string): number[] | undefined => {
  if (!raw?.trim()) return undefined;
  const levels = raw
    .split(',')
    .map((value) => parseNumber(value, 'levels', { integer: true, min: 1 })!);
  if (levels.some((level) => level > 10)) {
    throw new BadRequestException('Invalid levels');
  }
  return [...new Set(levels)];
};

const parseBoolean = (
  raw: string | undefined,
  name: string
): boolean | undefined => {
  if (raw == null || raw.trim() === '') return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new BadRequestException(`Invalid ${name}`);
};

const parseEnum = <T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  name: string
): T | undefined => {
  if (raw == null || raw.trim() === '') return undefined;
  if (!allowed.includes(raw as T)) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return raw as T;
};

@ApiTags('sessions')
@ApiBearerAuth('JWT-auth')
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private configService: ConfigService,
    private readonly sessionAccess: SessionAccessService
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
    @Query('endTimeAfter') endTimeAfter?: string,
    @Query('startTimeFrom') startTimeFrom?: string,
    @Query('startTimeTo') startTimeTo?: string,
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('sportType') sportTypeRaw?: string,
    @Query('sessionType') sessionType?: 'all' | 'regular' | 'facebook',
    @Query('favoriteOnly') favoriteOnly?: string
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
      startTimeFrom,
      startTimeTo,
      city,
      district,
      sportType: parseSportTypes(sportTypeRaw),
      sessionType,
      favoriteOnly: favoriteOnly === 'true',
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
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('sessionType') sessionType?: 'all' | 'regular' | 'facebook'
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
      sessionType,
    });
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('available')
  getAvailable(
    @Query('date') date?: string,
    @Query('level') levelRaw?: string,
    @Query('levels') levelsRaw?: string,
    @Query('timeRanges') timeRangesRaw?: string,
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('venueId') venueId?: string,
    @Query('sportType') sportTypeRaw?: string,
    @Query('minFee') minFee?: string,
    @Query('maxFee') maxFee?: string,
    @Query('feeType') feeTypeRaw?: string,
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
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('sessionType') sessionType?: 'all' | 'regular' | 'facebook',
    @Query('favoriteOnly') favoriteOnly?: string,
    @Query('includeEnded') includeEnded?: string,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    const level = parseNumber(levelRaw, 'level', { integer: true, min: 1 });
    if (level != null && level > 10) {
      throw new BadRequestException('Invalid level');
    }
    const levels = parseLevels(levelsRaw);
    const timeRanges = parseCsv(timeRangesRaw, TIME_RANGES, 'timeRanges');
    const feeType = parseEnum(feeTypeRaw, Object.values(FeeType), 'feeType');
    const parsedMinFee = parseNumber(minFee, 'minFee', { min: 0 });
    const parsedMaxFee = parseNumber(maxFee, 'maxFee', { min: 0 });
    if (
      parsedMinFee != null &&
      parsedMaxFee != null &&
      parsedMinFee > parsedMaxFee
    ) {
      throw new BadRequestException('minFee must not exceed maxFee');
    }
    if (date) {
      const parsedDate = new Date(`${date}T00:00:00.000+07:00`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toLocaleDateString('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
        }) !== date
      ) {
        throw new BadRequestException('Invalid date');
      }
    }
    const parsedSessionType = parseEnum(
      sessionType,
      ['all', 'regular', 'facebook'] as const,
      'sessionType'
    );
    const parsedSortOrder = parseEnum(
      sortOrder,
      ['asc', 'desc'] as const,
      'sortOrder'
    );
    const parsedHasSlots = parseBoolean(hasSlots, 'hasSlots');
    const parsedSortByDistance = parseBoolean(sortByDistance, 'sortByDistance');
    const parsedFavoriteOnly = parseBoolean(favoriteOnly, 'favoriteOnly');
    const parsedIncludeEnded = parseBoolean(includeEnded, 'includeEnded');

    return this.sessionsService.findAvailable(
      {
        date,
        level,
        levels,
        timeRanges,
        city,
        district,
        venueId,
        sportType: parseSportTypes(sportTypeRaw),
        minFee: parsedMinFee,
        maxFee: parsedMaxFee,
        feeType,
        hasSlots: parsedHasSlots,
        minAvailableSlots: parseNumber(minAvailableSlots, 'minAvailableSlots', {
          integer: true,
          min: 0,
        }),
        searchQuery,
        lat: parseNumber(lat, 'lat'),
        lng: parseNumber(lng, 'lng'),
        sortByDistance: parsedSortByDistance,
        page: parseNumber(page, 'page', { integer: true, min: 1 }),
        limit: parseNumber(limit, 'limit', { integer: true, min: 1 }),
        hostId,
        sortBy,
        sortOrder: parsedSortOrder,
        sessionType: parsedSessionType,
        favoriteOnly: parsedFavoriteOnly,
        includeEnded: parsedIncludeEnded,
      },
      user?.userId
    );
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

  @Post(':id/clone')
  async cloneSession(
    @Param('id') id: string,
    @Body() cloneSessionDto: CloneSessionDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(id, user.userId, user.role);
    return this.sessionsService.cloneSession(id, cloneSessionDto);
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
  async start(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(id, user.userId, user.role);
    return this.sessionsService.start(id);
  }

  @Post(':id/end')
  async end(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(id, user.userId, user.role);
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
  async updateBulkStatus(
    @Body()
    updateBulkStatusDto: import('./dto/update-bulk-status.dto').UpdateBulkStatusDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionsHost(
      updateBulkStatusDto.sessionIds,
      user.userId,
      user.role
    );
    return this.sessionsService.updateBulkStatus(
      updateBulkStatusDto.sessionIds,
      updateBulkStatusDto.status
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(id, user.userId, user.role);
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
  async autoAssign(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(id, user.userId, user.role);
    return this.sessionsService.autoAssign(id);
  }

  @Get(':id/waiting-queue')
  getWaitingQueue(@Param('id') id: string) {
    return this.sessionsService.getWaitingQueue(id);
  }

  @Put(':id/wait-times')
  async updateWaitTimes(
    @Param('id') id: string,
    @Body() updateWaitTimesDto: UpdateWaitTimesDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertSessionHost(id, user.userId, user.role);
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
