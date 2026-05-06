import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from '../categories/categories.service';
import { EndCategoryMatchDto } from '../categories/dto/end-category-match.dto';
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

  @Post(':id/end')
  endMatch(
    @Param('id') id: string,
    @Body() dto: EndCategoryMatchDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.endMatch(id, dto, user.userId, user.role);
  }
}
