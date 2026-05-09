import {
  Controller,
  Post,
  Get,
  Put,
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
import { ScheduleGeneratorService } from '../services/schedule-generator.service';

@ApiTags('tournament-schedule')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments/:tournamentId/schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleGeneratorController {
  constructor(
    private readonly scheduleGeneratorService: ScheduleGeneratorService
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
}
