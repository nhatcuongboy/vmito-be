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
import { Throttle } from '@nestjs/throttler';
import { VenuesService } from './venues.service';
import { VenueAddressMigrationService } from './venue-address-migration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { SearchVenueDto } from './dto/search-venue.dto';
import { CreateBulkVenueDto } from './dto/create-bulk-venue.dto';
import {
  CalculateVenueRentalPriceDto,
  CreateVenuePriceBookDto,
  CreateVenuePriceRuleDto,
  UpdateVenuePriceBookDto,
  UpdateVenuePriceRuleDto,
} from './dto/venue-pricing.dto';
import {
  AddVenueManagerDto,
  UpdateVenueManagerDto,
  UpdateVenueRentalSettingsDto,
} from './dto/venue-management.dto';

@ApiTags('venues')
@ApiBearerAuth('JWT-auth')
@Controller('venues')
@UseGuards(JwtAuthGuard)
export class VenuesController {
  constructor(
    private readonly venuesService: VenuesService,
    private readonly addressMigration: VenueAddressMigrationService
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get('search')
  search(
    @Query() searchVenueDto: SearchVenueDto,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.venuesService.searchVenues(searchVenueDto, user?.userId);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.venuesService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get('new-admin-units')
  getNewAdminUnits() {
    return this.venuesService.getNewAdminUnits();
  }

  @Post('backfill-slugs')
  @UseGuards(AdminGuard)
  backfillSlugs() {
    return this.venuesService.backfillSlugs();
  }

  @Post('backfill-search-terms')
  @UseGuards(AdminGuard)
  backfillSearchTerms() {
    return this.venuesService.backfillSearchTerms();
  }

  /**
   * `?rescan=true` re-derives already-migrated venues (e.g. after a mapping
   * fix); without it only rows whose `newAddress` is still null are touched.
   * `?dryRun=true` reports what would change without writing anything.
   */
  @Post('migrate-addresses')
  @UseGuards(AdminGuard)
  migrateAddresses(
    @Query('rescan') rescan?: string,
    @Query('dryRun') dryRun?: string
  ) {
    return this.addressMigration.migrateAddresses({
      rescan: rescan === 'true',
      dryRun: dryRun === 'true',
    });
  }

  @Get('managed-by-me')
  findManagedByMe(@CurrentUser() user: AuthenticatedUser) {
    return this.venuesService.findManagedByUser(user.userId, user.role);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }

  @Public()
  @Get(':venueId/price-books')
  findPriceBooks(@Param('venueId') venueId: string) {
    return this.venuesService.findPriceBooks(venueId);
  }

  @Post(':venueId/price-books')
  createPriceBook(
    @Param('venueId') venueId: string,
    @Body() dto: CreateVenuePriceBookDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.createPriceBook(
      venueId,
      dto,
      user.userId,
      user.role
    );
  }

  @Public()
  @Get(':venueId/price-books/:priceBookId')
  findPriceBook(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string
  ) {
    return this.venuesService.findPriceBook(venueId, priceBookId);
  }

  @Patch(':venueId/price-books/:priceBookId')
  updatePriceBook(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string,
    @Body() dto: UpdateVenuePriceBookDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.updatePriceBook(
      venueId,
      priceBookId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete(':venueId/price-books/:priceBookId')
  deletePriceBook(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.deletePriceBook(
      venueId,
      priceBookId,
      user.userId,
      user.role
    );
  }

  @Post(':venueId/price-books/:priceBookId/rules')
  createPriceRule(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string,
    @Body() dto: CreateVenuePriceRuleDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.createPriceRule(
      venueId,
      priceBookId,
      dto,
      user.userId,
      user.role
    );
  }

  @Patch(':venueId/price-books/:priceBookId/rules/:ruleId')
  updatePriceRule(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateVenuePriceRuleDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.updatePriceRule(
      venueId,
      priceBookId,
      ruleId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete(':venueId/price-books/:priceBookId/rules/:ruleId')
  deletePriceRule(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.deletePriceRule(
      venueId,
      priceBookId,
      ruleId,
      user.userId,
      user.role
    );
  }

  @Get(':venueId/managers')
  findManagers(
    @Param('venueId') venueId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.findManagers(venueId, user.userId, user.role);
  }

  @Get(':venueId/manager-candidates')
  searchManagerCandidates(
    @Param('venueId') venueId: string,
    @Query('query') query: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.searchManagerCandidates(
      venueId,
      query || '',
      user.userId,
      user.role
    );
  }

  @Post(':venueId/managers')
  addManager(
    @Param('venueId') venueId: string,
    @Body() dto: AddVenueManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.addManager(venueId, dto, user.userId, user.role);
  }

  @Patch(':venueId/managers/:managerId')
  updateManager(
    @Param('venueId') venueId: string,
    @Param('managerId') managerId: string,
    @Body() dto: UpdateVenueManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.updateManager(
      venueId,
      managerId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete(':venueId/managers/:managerId')
  removeManager(
    @Param('venueId') venueId: string,
    @Param('managerId') managerId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.removeManager(
      venueId,
      managerId,
      user.userId,
      user.role
    );
  }

  @Patch(':venueId/rental-settings')
  updateRentalSettings(
    @Param('venueId') venueId: string,
    @Body() dto: UpdateVenueRentalSettingsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.venuesService.updateRentalSettings(
      venueId,
      dto,
      user.userId,
      user.role
    );
  }

  @Post(':venueId/calculate-rental-price')
  calculateRentalPrice(
    @Param('venueId') venueId: string,
    @Body() dto: CalculateVenueRentalPriceDto
  ) {
    return this.venuesService.calculateRentalPrice(venueId, dto);
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
