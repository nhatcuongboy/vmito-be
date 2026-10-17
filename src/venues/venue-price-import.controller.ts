import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { VenuePriceImportService } from './venue-price-import.service';
import {
  BulkCreateVenuePriceRulesDto,
  ImportVenuePriceBookDto,
} from './dto/venue-price-import.dto';

@ApiTags('venues')
@ApiBearerAuth('JWT-auth')
@Controller('venues')
@UseGuards(JwtAuthGuard)
export class VenuePriceImportController {
  constructor(private readonly priceImport: VenuePriceImportService) {}

  /** Creates a price book together with all its rules in one transaction. */
  @Post(':venueId/price-books/import')
  importPriceBook(
    @Param('venueId') venueId: string,
    @Body() dto: ImportVenuePriceBookDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.priceImport.importPriceBook(
      venueId,
      dto,
      user.userId,
      user.role
    );
  }

  /** Adds (or replaces) many rules of an existing price book at once. */
  @Post(':venueId/price-books/:priceBookId/rules/bulk')
  bulkCreateRules(
    @Param('venueId') venueId: string,
    @Param('priceBookId') priceBookId: string,
    @Body() dto: BulkCreateVenuePriceRulesDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.priceImport.bulkCreateRules(
      venueId,
      priceBookId,
      dto,
      user.userId,
      user.role
    );
  }
}
