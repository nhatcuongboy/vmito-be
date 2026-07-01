import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { GenerateScheduleDto } from '../dto/schedule-generation.dto';
import { UpdateMatchAssignmentDto } from '../dto/update-match-assignment.dto';
import { AddMatchToQueueDto, ReorderQueueDto } from '../dto/queue.dto';
import { ScheduleGeneratorService } from '../services/schedule-generator.service';
import { ScheduleService } from '../services/schedule.service';
import { TournamentMatchGenerationService } from '../services/tournament-match-generation.service';

@ApiTags('tournament-schedule')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments/:tournamentId/schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleGeneratorController {
  constructor(
    private readonly scheduleGeneratorService: ScheduleGeneratorService,
    private readonly scheduleService: ScheduleService,
    private readonly tournamentMatchGenerationService: TournamentMatchGenerationService
  ) {}

  @Post('generate')
  async generate(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: GenerateScheduleDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleGeneratorService.generate(
      tournamentId,
      dto,
      user.userId
    );
  }

  @Get(':scheduleId/preview')
  async getPreview(
    @Param('tournamentId') tournamentId: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleGeneratorService.getPreview(
      tournamentId,
      scheduleId,
      user.userId
    );
  }

  @Put(':scheduleId/matches/:matchId')
  async updateMatchAssignment(
    @Param('tournamentId') tournamentId: string,
    @Param('scheduleId') scheduleId: string,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchAssignmentDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleGeneratorService.updateMatchAssignment(
      tournamentId,
      scheduleId,
      matchId,
      dto,
      user.userId
    );
  }

  @Post(':scheduleId/save')
  async saveSchedule(
    @Param('tournamentId') tournamentId: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleGeneratorService.saveSchedule(
      tournamentId,
      scheduleId,
      user.userId
    );
  }

  @Post('validate')
  async validateConfig(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: GenerateScheduleDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleGeneratorService.validateConfig(
      tournamentId,
      dto,
      user.userId
    );
  }

  @Get('readiness')
  async getReadiness(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.tournamentMatchGenerationService.getScheduleReadiness(
      tournamentId,
      user.userId
    );
  }

  @Delete('clear')
  async clearSchedule(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return await this.scheduleGeneratorService.clearSchedule(
      tournamentId,
      user.userId
    );
  }

  @Delete('matches/unscheduled')
  async deleteUnscheduledMatches(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return await this.scheduleGeneratorService.deleteUnscheduledMatches(
      tournamentId,
      user.userId
    );
  }

  @Delete('matches/all')
  async deleteAllMatches(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    // Deprecated: use DELETE /tournaments/:tournamentId/matches from the
    // rounds/match-management UI. Kept as a compatibility alias.
    return await this.tournamentMatchGenerationService.deleteAllTournamentMatches(
      tournamentId,
      user.userId
    );
  }

  // ==========================================
  // Next Available Court mode (live queue)
  // ==========================================

  @Get('courts/available')
  async getAvailableCourts(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleService.getAvailableCourts(tournamentId, user.userId);
  }

  @Get('queue')
  async getQueuedMatches(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleService.getQueuedMatches(tournamentId, user.userId);
  }

  @Get('queue/addable')
  async getAddableMatches(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleService.getUnqueuedMatches(tournamentId, user.userId);
  }

  @Post('queue/initialize')
  async initializeQueue(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleService.initializeQueue(tournamentId, user.userId);
  }

  @Post('queue/add')
  async addMatchToQueue(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: AddMatchToQueueDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    await this.scheduleService.addMatchToQueue(
      tournamentId,
      dto.matchId,
      user.userId,
      dto.queueOrder
    );
    return { success: true };
  }

  @Put('queue/reorder')
  async reorderQueue(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ReorderQueueDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    await this.scheduleService.reorderQueue(
      tournamentId,
      dto.matchIds,
      user.userId
    );
    return { success: true };
  }

  @Delete('queue/:matchId')
  async removeMatchFromQueue(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    await this.scheduleService.removeMatchFromQueue(
      tournamentId,
      matchId,
      user.userId
    );
    return { success: true };
  }

  @Post('auto-assign')
  async autoAssignNextMatch(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    return this.scheduleService.autoAssignNextMatch(tournamentId, user.userId);
  }

  @Post('matches/:matchId/unassign')
  async unassignMatch(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<unknown> {
    await this.scheduleService.unassignMatch(
      tournamentId,
      matchId,
      user.userId
    );
    return { success: true };
  }
}
