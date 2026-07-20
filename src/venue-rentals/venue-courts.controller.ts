import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  CourtScheduleQueryDto,
  CreateCourtBlockDto,
  CreateVenueCourtDto,
  ManagerCourtScheduleQueryDto,
  ReplaceOperatingPeriodsDto,
  UpdateVenueCourtDto,
} from './dto/venue-court.dto';
import { VenueCourtsService } from './venue-courts.service';

@Controller('venues/:venueId')
export class VenueCourtsController {
  constructor(private readonly service: VenueCourtsService) {}

  @Public()
  @Get('court-schedule')
  publicSchedule(
    @Param('venueId') venueId: string,
    @Query() query: CourtScheduleQueryDto
  ) {
    return this.service.publicSchedule(venueId, query.date, query.customerType);
  }

  @Get('manage/court-schedule')
  managerSchedule(
    @Param('venueId') venueId: string,
    @Query() query: ManagerCourtScheduleQueryDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.managerSchedule(
      venueId,
      query.date,
      user.userId,
      user.role
    );
  }

  @Get('courts')
  listCourts(@Param('venueId') venueId: string) {
    return this.service.listCourts(venueId);
  }

  @Post('courts')
  createCourt(
    @Param('venueId') venueId: string,
    @Body() dto: CreateVenueCourtDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.createCourt(venueId, dto, user.userId, user.role);
  }

  @Patch('courts/:courtId')
  updateCourt(
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Body() dto: UpdateVenueCourtDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.updateCourt(
      venueId,
      courtId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete('courts/:courtId')
  removeCourt(
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.removeCourt(venueId, courtId, user.userId, user.role);
  }

  @Get('operating-periods')
  operatingPeriods(@Param('venueId') venueId: string) {
    return this.service.getOperatingPeriods(venueId);
  }

  @Put('operating-periods')
  replaceOperatingPeriods(
    @Param('venueId') venueId: string,
    @Body() dto: ReplaceOperatingPeriodsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.replaceOperatingPeriods(
      venueId,
      dto,
      user.userId,
      user.role
    );
  }

  @Get('court-blocks')
  listBlocks(
    @Param('venueId') venueId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.listBlocks(venueId, user.userId, user.role);
  }

  @Post('court-blocks')
  createBlock(
    @Param('venueId') venueId: string,
    @Body() dto: CreateCourtBlockDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.createBlock(venueId, dto, user.userId, user.role);
  }

  @Delete('court-blocks/:blockId')
  removeBlock(
    @Param('venueId') venueId: string,
    @Param('blockId') blockId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.removeBlock(venueId, blockId, user.userId, user.role);
  }
}
