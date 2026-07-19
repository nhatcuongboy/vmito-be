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
import {
  CreateRentalProposalDto,
  CreateManualRentalDto,
  CreateVenueRentalDto,
  LinkRentalSessionDto,
  QueryVenueRentalsDto,
  RentalReasonDto,
  ReallocateRentalCourtsDto,
} from './dto/venue-rental.dto';
import { VenueRentalsService } from './venue-rentals.service';

@Controller('venue-rentals')
export class VenueRentalsController {
  constructor(private readonly service: VenueRentalsService) {}

  @Post()
  create(
    @Body() dto: CreateVenueRentalDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.create(dto, user.userId);
  }

  @Get('my')
  findMine(
    @Query() query: QueryVenueRentalsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.findMine(user.userId, query);
  }

  @Get('manage')
  findManaged(
    @Query() query: QueryVenueRentalsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.findManaged(user.userId, user.role, query);
  }

  @Post('manage/manual')
  createManual(
    @Body() dto: CreateManualRentalDto,
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
    return this.service.reject(id, dto.reason, user.userId, user.role);
  }

  @Post(':id/proposals')
  propose(
    @Param('id') id: string,
    @Body() dto: CreateRentalProposalDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.propose(id, dto, user.userId, user.role);
  }

  @Post(':id/proposals/:proposalId/accept')
  acceptProposal(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.acceptProposal(id, proposalId, user.userId);
  }

  @Post(':id/proposals/:proposalId/decline')
  declineProposal(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.declineProposal(id, proposalId, user.userId);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: RentalReasonDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.cancel(id, dto.reason, user.userId, user.role);
  }

  @Patch(':id/session')
  linkSession(
    @Param('id') id: string,
    @Body() dto: LinkRentalSessionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.linkSession(id, dto.sessionId, user.userId);
  }

  @Patch(':id/courts')
  reallocateCourts(
    @Param('id') id: string,
    @Body() dto: ReallocateRentalCourtsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.reallocateCourts(id, dto, user.userId, user.role);
  }
}
