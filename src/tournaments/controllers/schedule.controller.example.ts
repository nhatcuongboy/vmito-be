import { Body, Param } from '@nestjs/common';
import { ScheduleService } from '../services/schedule.service';
import type { ScheduleAssignment } from '../types/schedule.types';

/**
 * Example Schedule Controller
 *
 * Uncomment and customize this controller when ready to implement scheduling endpoints
 */

// @Controller('tournaments/:tournamentId/schedule')
// @UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ==========================================
  // Next Available Court Mode Endpoints
  // ==========================================

  /**
   * Get available courts
   * GET /tournaments/:tournamentId/schedule/courts/available
   */
  // @Get('courts/available')
  async getAvailableCourts(@Param('tournamentId') tournamentId: string) {
    return this.scheduleService.getAvailableCourts(tournamentId);
  }

  /**
   * Get queued matches
   * GET /tournaments/:tournamentId/schedule/queue
   */
  // @Get('queue')
  async getQueuedMatches(@Param('tournamentId') tournamentId: string) {
    return this.scheduleService.getQueuedMatches(tournamentId);
  }

  /**
   * Add match to queue
   * POST /tournaments/:tournamentId/schedule/queue/add
   * Body: { matchId: string, queueOrder?: number }
   */
  // @Post('queue/add')
  async addMatchToQueue(
    @Param('tournamentId') tournamentId: string,
    @Body() body: { matchId: string; queueOrder?: number }
  ) {
    await this.scheduleService.addMatchToQueue(body.matchId, body.queueOrder);
    return { success: true };
  }

  /**
   * Remove match from queue
   * DELETE /tournaments/:tournamentId/schedule/queue/:matchId
   */
  // @Delete('queue/:matchId')
  async removeMatchFromQueue(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string
  ) {
    await this.scheduleService.removeMatchFromQueue(matchId);
    return { success: true };
  }

  /**
   * Reorder queue
   * PUT /tournaments/:tournamentId/schedule/queue/reorder
   * Body: { matchIds: string[] }
   */
  // @Put('queue/reorder')
  async reorderQueue(
    @Param('tournamentId') tournamentId: string,
    @Body() body: { matchIds: string[] }
  ) {
    await this.scheduleService.reorderQueue(body.matchIds);
    return { success: true };
  }

  /**
   * Auto-assign next match to available court
   * POST /tournaments/:tournamentId/schedule/auto-assign
   */
  // @Post('auto-assign')
  async autoAssignNextMatch(@Param('tournamentId') tournamentId: string) {
    const result = await this.scheduleService.autoAssignNextMatch(tournamentId);
    return result;
  }

  /**
   * Release court after match finishes
   * POST /tournaments/:tournamentId/matches/:matchId/release-court
   */
  // @Post('../matches/:matchId/release-court')
  async releaseCourtAfterMatch(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string
  ) {
    await this.scheduleService.releaseCourtAfterMatch(matchId);

    // Auto-assign next match
    const result = await this.scheduleService.autoAssignNextMatch(tournamentId);

    return {
      courtReleased: true,
      nextMatchAssigned: result.success,
      nextMatch: result.success
        ? {
            matchId: result.matchId,
            courtId: result.courtId,
            assignedAt: result.assignedAt,
          }
        : null,
    };
  }

  // ==========================================
  // Assigned Courts & Times Mode Endpoints
  // ==========================================

  /**
   * Assign match to court and time
   * POST /tournaments/:tournamentId/schedule/assign
   * Body: ScheduleAssignment
   */
  // @Post('assign')
  async assignMatchToCourtAndTime(
    @Param('tournamentId') tournamentId: string,
    @Body() assignment: ScheduleAssignment
  ) {
    await this.scheduleService.assignMatchToCourtAndTime(assignment);
    return { success: true };
  }

  /**
   * Update match assignment
   * PUT /tournaments/:tournamentId/schedule/assign/:matchId
   * Body: Partial<ScheduleAssignment>
   */
  // @Put('assign/:matchId')
  async updateMatchAssignment(
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Body() assignment: Partial<ScheduleAssignment>
  ) {
    const fullAssignment: ScheduleAssignment = {
      matchId,
      ...assignment,
    } as ScheduleAssignment;

    await this.scheduleService.assignMatchToCourtAndTime(fullAssignment);
    return { success: true };
  }

  /**
   * Detect schedule conflicts
   * POST /tournaments/:tournamentId/schedule/validate
   * Body: ScheduleAssignment
   */
  // @Post('validate')
  async detectScheduleConflicts(
    @Param('tournamentId') tournamentId: string,
    @Body() assignment: ScheduleAssignment
  ) {
    const conflicts =
      await this.scheduleService.detectScheduleConflicts(assignment);
    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Get all conflicts in tournament schedule
   * GET /tournaments/:tournamentId/schedule/conflicts
   */
  // @Get('conflicts')
  getAllScheduleConflicts(@Param('tournamentId') _tournamentId: string) {
    // TODO: Implement method to check all matches for conflicts
    return { conflicts: [] };
  }

  /**
   * Get full tournament schedule
   * GET /tournaments/:tournamentId/schedule
   */
  // @Get()
  getTournamentSchedule(@Param('tournamentId') _tournamentId: string) {
    // TODO: Implement method to get full schedule with all matches
    return { schedule: [] };
  }
}

/**
 * Usage Example in TournamentsModule:
 *
 * @Module({
 *   imports: [PrismaModule],
 *   controllers: [TournamentsController, ScheduleController],
 *   providers: [TournamentsService, ScheduleService],
 *   exports: [TournamentsService, ScheduleService],
 * })
 * export class TournamentsModule {}
 */
