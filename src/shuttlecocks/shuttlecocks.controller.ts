import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { QueryShuttlecocksDto } from './dto/query-shuttlecocks.dto';
import { ShuttlecocksService } from './shuttlecocks.service';

@ApiTags('shuttlecocks')
@Controller('shuttlecocks')
export class ShuttlecocksController {
  constructor(private readonly shuttlecocksService: ShuttlecocksService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all shuttlecocks (searchable, filterable, sortable)' })
  findAll(@Query() query: QueryShuttlecocksDto) {
    return this.shuttlecocksService.findAll(query);
  }

  @Public()
  @Get('brands')
  @ApiOperation({ summary: 'Get list of unique shuttlecock brands' })
  findBrands() {
    return this.shuttlecocksService.findBrands();
  }

  @Public()
  @Get('speeds')
  @ApiOperation({ summary: 'Get list of available speed options' })
  findSpeeds() {
    return this.shuttlecocksService.findSpeeds();
  }

  @Public()
  @Get('sitemap')
  @ApiOperation({ summary: 'Slugs for sitemap generation' })
  findForSitemap() {
    return this.shuttlecocksService.findForSitemap();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get shuttlecock detail by slug with specifications and store offers' })
  findBySlug(@Param('slug') slug: string) {
    return this.shuttlecocksService.findBySlug(slug);
  }

  @Public()
  @Get(':slug/related')
  @ApiOperation({ summary: 'Get related shuttlecocks' })
  findRelated(@Param('slug') slug: string) {
    return this.shuttlecocksService.findRelated(slug);
  }

  @Public()
  @Get(':slug/sessions')
  @ApiOperation({ summary: 'Get active Vmito sessions playing with this shuttlecock' })
  findActiveSessions(@Param('slug') slug: string) {
    return this.shuttlecocksService.findActiveSessions(slug);
  }
}
