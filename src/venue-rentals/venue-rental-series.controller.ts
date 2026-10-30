import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { RentalReasonDto } from './dto/venue-rental.dto';
import {
  CreateManualRentalSeriesDto,
  CreateRentalSeriesDto,
  ExtendRentalSeriesDto,
  RentalSeriesPlanDto,
  SubmitSeriesPaymentDto,
} from './dto/venue-rental-series.dto';
import { VenueRentalSeriesService } from './venue-rental-series.service';

@ApiTags('Venue rental series')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('venue-rental-series')
export class VenueRentalSeriesController {
  constructor(private readonly service: VenueRentalSeriesService) {}

  @Post('preview/:venueId')
  preview(
    @Param('venueId') venueId: string,
    @Body() dto: RentalSeriesPlanDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.preview(venueId, dto, user.userId);
  }

  @Post()
  create(
    @Body() dto: CreateRentalSeriesDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.create(dto, user.userId);
  }

  @Post('manual')
  createManual(
    @Body() dto: CreateManualRentalSeriesDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.createManual(dto, user.userId, user.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user.userId, user.role);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.approve(id, user.userId, user.role);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RentalReasonDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.reject(id, dto.reason ?? '', user.userId, user.role);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: RentalReasonDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.cancelRemaining(id, dto.reason, user.userId, user.role);
  }

  @Post(':id/extend')
  extend(
    @Param('id') id: string,
    @Body() dto: ExtendRentalSeriesDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.extend(id, dto, user.userId, user.role);
  }

  @Post(':id/payments')
  submitPayment(
    @Param('id') id: string,
    @Body() dto: SubmitSeriesPaymentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.submitPayment(id, dto, user.userId);
  }

  @Post(':id/payments/:batchId/approve')
  approveBatch(
    @Param('id') id: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.approveBatch(id, batchId, user.userId, user.role);
  }

  @Post(':id/payments/:batchId/reject')
  rejectBatch(
    @Param('id') id: string,
    @Param('batchId') batchId: string,
    @Body() dto: RentalReasonDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.rejectBatch(
      id,
      batchId,
      dto.reason ?? '',
      user.userId,
      user.role
    );
  }
}
