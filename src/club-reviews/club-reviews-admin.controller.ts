import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  AdminClubReviewsQueryDto,
  UpdateClubReviewStatusDto,
} from './dto/club-review.dto';
import { ClubReviewsAdminService } from './club-reviews-admin.service';

@ApiTags('club-reviews-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/club-reviews')
@UseGuards(AdminGuard)
export class ClubReviewsAdminController {
  constructor(private readonly adminService: ClubReviewsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Moderation list of club reviews' })
  list(@Query() query: AdminClubReviewsQueryDto) {
    return this.adminService.list(query);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Hide or show a review' })
  setStatus(@Param('id') id: string, @Body() dto: UpdateClubReviewStatusDto) {
    return this.adminService.setStatus(id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a review' })
  remove(@Param('id') id: string) {
    return this.adminService.remove(id);
  }
}
