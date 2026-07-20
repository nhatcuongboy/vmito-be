import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

@Controller('venues')
export class VenueRentalVenuesController {
  constructor(private readonly service: VenueRentalsService) {}

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
