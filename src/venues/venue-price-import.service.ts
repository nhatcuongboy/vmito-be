import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VenueAccessService } from './venue-access.service';
import {
  BulkCreateVenuePriceRulesDto,
  ImportVenuePriceBookDto,
} from './dto/venue-price-import.dto';
import {
  buildPriceBookData,
  buildPriceRuleData,
  PRICE_RULE_ORDER_BY,
  validatePriceRules,
} from './venue-price-rule.util';

/**
 * Creates many price rules at once (from the text/AI import flow) inside a
 * single transaction, so a failure never leaves a half-imported price book.
 */
@Injectable()
export class VenuePriceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  async importPriceBook(
    venueId: string,
    dto: ImportVenuePriceBookDto,
    userId: string,
    role: string
  ) {
    await this.venueAccess.assertManager(venueId, userId, role);
    await this.venueAccess.ensureVenue(venueId);
    validatePriceRules(dto.rules);

    return this.prisma.$transaction(async (tx) => {
      const book = await tx.venuePriceBook.create({
        data: buildPriceBookData(venueId, dto.book),
      });
      await tx.venuePriceRule.createMany({
        data: dto.rules.map((rule) => buildPriceRuleData(book.id, rule)),
      });
      return tx.venuePriceBook.findUniqueOrThrow({
        where: { id: book.id },
        include: { rules: { orderBy: PRICE_RULE_ORDER_BY } },
      });
    });
  }

  async bulkCreateRules(
    venueId: string,
    priceBookId: string,
    dto: BulkCreateVenuePriceRulesDto,
    userId: string,
    role: string
  ) {
    await this.venueAccess.assertManager(venueId, userId, role);
    const existing = await this.prisma.venuePriceBook.findFirst({
      where: { id: priceBookId, venueId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Price book not found');
    }
    validatePriceRules(dto.rules);

    return this.prisma.$transaction(async (tx) => {
      if (dto.replaceExisting) {
        await tx.venuePriceRule.deleteMany({ where: { priceBookId } });
      }
      await tx.venuePriceRule.createMany({
        data: dto.rules.map((rule) => buildPriceRuleData(priceBookId, rule)),
      });
      return tx.venuePriceBook.findUniqueOrThrow({
        where: { id: priceBookId },
        include: { rules: { orderBy: PRICE_RULE_ORDER_BY } },
      });
    });
  }
}
