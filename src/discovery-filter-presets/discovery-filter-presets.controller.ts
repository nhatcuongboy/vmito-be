import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParseEnumPipe } from '@nestjs/common';
import { DiscoveryFilterTab } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  CreateDiscoveryFilterPresetDto,
  UpdateDiscoveryFilterPresetDto,
} from './discovery-filter-presets.dto';
import { DiscoveryFilterPresetsService } from './discovery-filter-presets.service';

@ApiTags('discovery-filter-presets')
@ApiBearerAuth('JWT-auth')
@Controller('discovery-filter-presets')
export class DiscoveryFilterPresetsController {
  constructor(private readonly service: DiscoveryFilterPresetsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tab', new ParseEnumPipe(DiscoveryFilterTab)) tab: DiscoveryFilterTab
  ) {
    return this.service.list(user.userId, tab);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDiscoveryFilterPresetDto
  ) {
    return this.service.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDiscoveryFilterPresetDto
  ) {
    return this.service.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.userId, id);
  }
}
