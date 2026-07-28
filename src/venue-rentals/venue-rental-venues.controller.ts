import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  CreateRentalQuoteDto,
  RentalAvailabilityDto,
} from './dto/venue-rental.dto';
import { VenueRentalsService } from './venue-rentals.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';
import { UpdateRentalPaymentSettingsDto } from './dto/venue-rental-payment.dto';

@Controller('venues')
export class VenueRentalVenuesController {
  constructor(
    private readonly service: VenueRentalsService,
    private readonly payments: VenueRentalPaymentsService
  ) {}

  @Get(':venueId/rental-payment-settings')
  paymentSettings(
    @Param('venueId') venueId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.payments.getSettings(venueId, user.userId, user.role);
  }

  @Patch(':venueId/rental-payment-settings')
  updatePaymentSettings(
    @Param('venueId') venueId: string,
    @Body() dto: UpdateRentalPaymentSettingsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.payments.updateSettings(venueId, dto, user.userId, user.role);
  }

  @Post(':venueId/rental-quotes')
  createQuote(
    @Param('venueId') venueId: string,
    @Body() dto: CreateRentalQuoteDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.createQuote(venueId, dto, user.userId);
  }

  @Public()
  @Get(':venueId/rental-availability')
  availability(
    @Param('venueId') venueId: string,
    @Query() query: RentalAvailabilityDto
  ) {
    return this.service.availability(venueId, query.startTime, query.endTime);
  }
}
