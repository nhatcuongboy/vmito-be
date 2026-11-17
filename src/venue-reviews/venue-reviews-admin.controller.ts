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
  AdminVenueReviewsQueryDto,
  UpdateVenueReviewStatusDto,
} from './dto/venue-review-query.dto';
import { VenueReviewsAdminService } from './venue-reviews-admin.service';

@ApiTags('venue-reviews-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/venue-reviews')
@UseGuards(AdminGuard)
export class VenueReviewsAdminController {
  constructor(private readonly adminService: VenueReviewsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Moderation list of venue reviews' })
  list(@Query() query: AdminVenueReviewsQueryDto) {
    return this.adminService.list(query);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Hide or show a review' })
  setStatus(@Param('id') id: string, @Body() dto: UpdateVenueReviewStatusDto) {
    return this.adminService.setStatus(id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a review' })
  remove(@Param('id') id: string) {
    return this.adminService.remove(id);
  }
}
