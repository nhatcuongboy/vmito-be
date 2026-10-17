import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HostAwardsService } from './host-awards.service';
import { HostAwardsQueryService } from './host-awards-query.service';
import {
  CreateHostAwardSanctionDto,
  HostEntryParamDto,
  MonthKeyParamDto,
  SetHostExclusionDto,
} from './dto/host-awards.dto';

type AdminUser = { userId: string; email?: string; name?: string };

@ApiTags('host-awards-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/host-awards')
@UseGuards(JwtAuthGuard, AdminGuard)
export class HostAwardsAdminController {
  constructor(
    private readonly awards: HostAwardsService,
    private readonly query: HostAwardsQueryService
  ) {}

  @Get(':monthKey/review')
  @ApiOperation({ summary: 'Admin: ranked hosts with metrics and fraud flags' })
  getReview(@Param() params: MonthKeyParamDto) {
    return this.query.getReview(params.monthKey);
  }

  @Post(':monthKey/recompute')
  @ApiOperation({ summary: 'Admin: recompute a month (keeps admin decisions)' })
  recompute(@Param() params: MonthKeyParamDto) {
    return this.awards.computeSnapshot(params.monthKey);
  }

  @Patch(':monthKey/hosts/:hostId')
  @ApiOperation({ summary: 'Admin: exclude or re-include a host' })
  setExclusion(
    @Param() params: HostEntryParamDto,
    @Body() dto: SetHostExclusionDto,
    @CurrentUser() user: AdminUser
  ) {
    return this.awards.setExclusion(
      params.monthKey,
      params.hostId,
      dto.excluded,
      dto.reason,
      user
    );
  }

  @Post(':monthKey/publish')
  @ApiOperation({
    summary: 'Admin: publish a reviewed month and notify winners',
  })
  publish(@Param() params: MonthKeyParamDto, @CurrentUser() user: AdminUser) {
    return this.awards.publish(params.monthKey, user);
  }

  @Post('sanctions')
  @ApiOperation({ summary: 'Admin: bar a host from the programme' })
  addSanction(
    @Body() dto: CreateHostAwardSanctionDto,
    @CurrentUser() user: AdminUser
  ) {
    return this.awards.addSanction(dto.hostId, dto.reason, dto.months, user);
  }
}
