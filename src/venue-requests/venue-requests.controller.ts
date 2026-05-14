import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateVenueRequestDto,
  QueryVenueRequestsDto,
  RejectVenueRequestDto,
} from './dto';
import { VenueRequestsService } from './venue-requests.service';

interface JwtUser {
  userId: string;
  role: Role;
}

@Controller('venue-requests')
@UseGuards(JwtAuthGuard)
export class VenueRequestsController {
  constructor(private readonly venueRequestsService: VenueRequestsService) {}

  @Post()
  create(@Body() dto: CreateVenueRequestDto, @CurrentUser() user: JwtUser) {
    return this.venueRequestsService.create(dto, user.userId);
  }

  @Get('my')
  findMine(
    @CurrentUser() user: JwtUser,
    @Query() query: QueryVenueRequestsDto
  ) {
    return this.venueRequestsService.findMine(user.userId, query);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAllAdmin(@Query() query: QueryVenueRequestsDto) {
    return this.venueRequestsService.findAllAdmin(query);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.venueRequestsService.approve(id, user.userId);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectVenueRequestDto,
    @CurrentUser() user: JwtUser
  ) {
    return this.venueRequestsService.reject(id, user.userId, dto.adminNote);
  }
}
