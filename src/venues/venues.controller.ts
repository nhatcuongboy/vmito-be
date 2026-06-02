import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { SearchVenueDto } from './dto/search-venue.dto';
import { CreateBulkVenueDto } from './dto/create-bulk-venue.dto';

@ApiTags('venues')
@ApiBearerAuth('JWT-auth')
@Controller('venues')
@UseGuards(JwtAuthGuard)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Public()
  @Get('search')
  search(@Query() searchVenueDto: SearchVenueDto) {
    return this.venuesService.searchVenues(searchVenueDto);
  }

  @Public()
  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.venuesService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('backfill-slugs')
  @UseGuards(AdminGuard)
  backfillSlugs() {
    return this.venuesService.backfillSlugs();
  }

  @Post('migrate-addresses')
  @UseGuards(AdminGuard)
  migrateAddresses() {
    return this.venuesService.migrateAddresses();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }

  @Post()
  create(@Body() createVenueDto: CreateVenueDto) {
    return this.venuesService.create(createVenueDto);
  }

  @Post('find-or-create')
  findOrCreate(@Body() createVenueDto: CreateVenueDto) {
    return this.venuesService.findOrCreate(createVenueDto);
  }

  @Post('bulk')
  @UseGuards(AdminGuard)
  createBulk(@Body() createBulkVenueDto: CreateBulkVenueDto) {
    return this.venuesService.createBulk(createBulkVenueDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateVenueDto: UpdateVenueDto) {
    return this.venuesService.update(id, updateVenueDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.venuesService.remove(id);
  }
}
