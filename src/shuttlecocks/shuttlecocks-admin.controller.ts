import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreateShuttlecockDto } from './dto/create-shuttlecock.dto';
import { UpdateShuttlecockDto } from './dto/update-shuttlecock.dto';
import { ShuttlecocksService } from './shuttlecocks.service';

@ApiTags('shuttlecocks-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/shuttlecocks')
@UseGuards(AdminGuard)
export class ShuttlecocksAdminController {
  constructor(private readonly shuttlecocksService: ShuttlecocksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all shuttlecocks for admin management' })
  findAll() {
    return this.shuttlecocksService.findAllAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single shuttlecock by id or slug' })
  findById(@Param('id') id: string) {
    return this.shuttlecocksService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new shuttlecock' })
  create(@Body() dto: CreateShuttlecockDto) {
    return this.shuttlecocksService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing shuttlecock' })
  update(@Param('id') id: string, @Body() dto: UpdateShuttlecockDto) {
    return this.shuttlecocksService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a shuttlecock' })
  remove(@Param('id') id: string) {
    return this.shuttlecocksService.remove(id);
  }
}
