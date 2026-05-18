import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { GetViewCountDto } from './dto/get-view-count.dto';
import { TrackViewDto } from './dto/track-view.dto';
import { ViewsService } from './views.service';

@ApiTags('views')
@Controller('views')
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @Public()
  @Post('track')
  trackView(@Body() dto: TrackViewDto) {
    return this.viewsService.trackView(dto.targetType, dto.targetId);
  }

  @Public()
  @Get('count')
  getViewCount(@Query() query: GetViewCountDto) {
    return this.viewsService.getViewCount(query.targetType, query.targetId);
  }
}
