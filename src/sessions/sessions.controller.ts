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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateWaitTimesDto } from './dto/update-wait-times.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

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
  findAll(@CurrentUser() user: { userId: string; role: string }) {
    return this.sessionsService.findAll(user);
  }

  @Get('available')
  getAvailable(
    @Query('date') date?: string,
    @Query('level') level?: number
  ) {
    return this.sessionsService.findAvailable({ date, level });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Post()
  create(
    @Body() createSessionDto: CreateSessionDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    if (user.role !== 'HOST' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only HOST or ADMIN can create sessions');
    }
    return this.sessionsService.create(createSessionDto, user.userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateSessionDto: UpdateSessionDto) {
    return this.sessionsService.update(id, updateSessionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionsService.remove(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.sessionsService.start(id);
  }

  @Post(':id/end')
  end(@Param('id') id: string) {
    return this.sessionsService.end(id);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.sessionsService.getStatus(id);
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
}
