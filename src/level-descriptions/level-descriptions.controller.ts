import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';
import { UpdateLevelDescriptionsDto } from './dto/update-level-descriptions.dto';
import { LevelDescriptionsService } from './level-descriptions.service';

@ApiTags('level-descriptions')
@ApiBearerAuth('JWT-auth')
@Controller()
export class LevelDescriptionsController {
  constructor(
    private readonly levelDescriptionsService: LevelDescriptionsService
  ) {}

  @Public()
  @Get('level-descriptions')
  findAll() {
    return this.levelDescriptionsService.findAll();
  }

  @Put('admin/level-descriptions')
  @UseGuards(AdminGuard)
  updateAll(@Body() dto: UpdateLevelDescriptionsDto) {
    return this.levelDescriptionsService.updateAll(dto);
  }
}
