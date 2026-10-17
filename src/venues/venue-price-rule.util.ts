import { BadRequestException } from '@nestjs/common';
import { Prisma, VenueDayType } from '@prisma/client';
import {
  CreateVenuePriceBookDto,
  CreateVenuePriceRuleDto,
} from './dto/venue-pricing.dto';

export const PRICE_RULE_ORDER_BY: Prisma.VenuePriceRuleOrderByWithRelationInput[] =
  [{ priority: 'desc' }, { startMinute: 'asc' }];

export const validatePriceRule = (rule: {
  dayType?: VenueDayType;
  daysOfWeek?: number[] | null;
  specificDate?: Date | string | null;
  startMinute?: number;
  endMinute?: number;
  pricePerHour?: number;
}) => {
  if (
    rule.startMinute === undefined ||
    rule.endMinute === undefined ||
    rule.endMinute <= rule.startMinute
  ) {
    throw new BadRequestException('endMinute must be greater than startMinute');
  }

  if (rule.dayType === VenueDayType.SPECIFIC_DATE && !rule.specificDate) {
    throw new BadRequestException(
      'specificDate is required for SPECIFIC_DATE rules'
    );
  }

  if (rule.pricePerHour !== undefined && rule.pricePerHour < 0) {
    throw new BadRequestException(
      'pricePerHour must be greater than or equal to 0'
    );
  }
};

/** Validates every rule, prefixing the message with the failing rule index. */
export const validatePriceRules = (rules: CreateVenuePriceRuleDto[]) => {
  rules.forEach((rule, index) => {
    try {
      validatePriceRule(rule);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException(`rules[${index}]: ${error.message}`);
      }
      throw error;
    }
  });
};

export const buildPriceRuleData = (
  priceBookId: string,
  dto: CreateVenuePriceRuleDto
): Prisma.VenuePriceRuleUncheckedCreateInput => ({
  priceBookId,
  dayType: dto.dayType,
  daysOfWeek: dto.daysOfWeek || [],
  specificDate: dto.specificDate ? new Date(dto.specificDate) : null,
  startMinute: dto.startMinute,
  endMinute: dto.endMinute,
  customerType: dto.customerType,
  isStudent: dto.isStudent ?? false,
  pricePerHour: dto.pricePerHour,
  minimumMinutes: dto.minimumMinutes,
  billingStepMinutes: dto.billingStepMinutes,
  priority: dto.priority ?? 0,
  notes: dto.notes,
});

export const buildPriceBookData = (
  venueId: string,
  dto: CreateVenuePriceBookDto
): Prisma.VenuePriceBookUncheckedCreateInput => ({
  venueId,
  name: dto.name,
  currency: dto.currency || 'VND',
  effectiveFrom: new Date(dto.effectiveFrom),
  effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
  isActive: dto.isActive ?? true,
  priority: dto.priority ?? 0,
  notes: dto.notes,
  priceImageUrl: dto.priceImageUrl,
  priceImagePublicId: dto.priceImagePublicId,
});
