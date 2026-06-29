import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CategoriesService } from '../categories/categories.service';
import { EndCategoryMatchDto } from '../categories/dto/end-category-match.dto';
import { UpdateMatchScoreDto } from '../categories/dto/update-match-score.dto';
import { UpdatePickleballServeDto } from '../categories/dto/update-pickleball-serve.dto';
import { UpdateSetScoreDto } from '../categories/dto/update-set-score.dto';
import { AssignRefereeDto } from '../categories/dto/assign-referee.dto';
import { BulkScheduleDto } from './dto/bulk-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

interface CurrentUserPayload {
  userId: string;
  role: string;
}

@ApiTags('category-matches')
@ApiBearerAuth('JWT-auth')
@Controller('category-matches')
@UseGuards(JwtAuthGuard)
export class CategoryMatchesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Put('bulk-schedule')
  bulkSchedule(
    @Body() dto: BulkScheduleDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.bulkUpdateSchedule(
      dto.updates,
      user.userId,
      user.role
    );
  }

  @Get('my-assignments')
  getMyAssignments(
    @CurrentUser() user: CurrentUserPayload,
    @Query('tournamentId') tournamentId?: string,
    @Query('status') status?: string
  ) {
    return this.categoriesService.getMyAssignments(user.userId, {
      tournamentId,
      status,
    });
  }

  @Public()
  @Get(':id')
  getMatch(@Param('id') id: string) {
    return this.categoriesService.getMatchById(id);
  }

  @Put(':id')
  updateMatch(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.updateMatch(
      id,
      dto as {
        courtId?: string;
        round?: string;
        matchNumber?: number;
        matchCode?: string;
        startTime?: string;
        matchFormat?: string;
        groupId?: string;
      },
      user.userId,
      user.role
    );
  }

  @Delete(':id')
  deleteMatch(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.deleteMatch(id, user.userId, user.role);
  }

  @Post(':id/start')
  startMatch(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.categoriesService.startMatch(id, user.userId, user.role);
  }

  @Post(':id/reset-result')
  resetMatchResult(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.resetMatchResult(id, user.userId, user.role);
  }

  @Post(':id/end')
  endMatch(
    @Param('id') id: string,
    @Body() dto: EndCategoryMatchDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.endMatch(id, dto, user.userId, user.role);
  }

  // ─── Live scoring (host / admin / assigned referee) ───
  // Point-by-point scoring is high-frequency (one request per tap) and already
  // authorized per match, so it gets a generous per-user limit instead of the
  // global default that would 429 an active referee mid-game.
  @Throttle({ default: { ttl: 60000, limit: 600 } })
  @Patch(':id/score')
  updateScore(
    @Param('id') id: string,
    @Body() dto: UpdateMatchScoreDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.updateMatchScore(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  @Throttle({ default: { ttl: 60000, limit: 600 } })
  @Patch(':id/score/undo')
  undoLastPoint(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.undoLastPoint(id, user.userId, user.role);
  }

  // Update pickleball doubles serve state (host / admin / assigned referee).
  @Throttle({ default: { ttl: 60000, limit: 600 } })
  @Patch(':id/pickleball-serve')
  updatePickleballServe(
    @Param('id') id: string,
    @Body() dto: UpdatePickleballServeDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.updatePickleballServe(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  // Overwrite an individual set's final score (host / admin / assigned referee).
  @Throttle({ default: { ttl: 60000, limit: 600 } })
  @Patch(':id/sets/:setNumber/score')
  updateSetScore(
    @Param('id') id: string,
    @Param('setNumber') setNumber: string,
    @Body() dto: UpdateSetScoreDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.updateSetScore(
      id,
      Number(setNumber),
      dto,
      user.userId,
      user.role
    );
  }

  // ─── Referee assignment (host / admin) ───
  @Patch(':id/referee')
  assignReferee(
    @Param('id') id: string,
    @Body() dto: AssignRefereeDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.assignReferee(
      id,
      dto.refereeId,
      user.userId,
      user.role
    );
  }

  @Delete(':id/referee')
  unassignReferee(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.unassignReferee(id, user.userId, user.role);
  }
}
