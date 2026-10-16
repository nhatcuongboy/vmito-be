import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VenueCustomerType, VenueDayType } from '@prisma/client';
import { Language } from '../../common/constants/language.enum';

export const MAX_PRICE_TEXT_LENGTH = 8000;

export class ExtractPriceRulesRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRICE_TEXT_LENGTH)
  text!: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}

/** One normalized price rule, shaped like CreateVenuePriceRuleDto. */
export interface ExtractedPriceRule {
  dayType: VenueDayType;
  daysOfWeek: number[];
  /** YYYY-MM-DD, only for HOLIDAY / SPECIFIC_DATE. */
  specificDate: string | null;
  startMinute: number;
  endMinute: number;
  customerType: VenueCustomerType;
  pricePerHour: number;
  minimumMinutes: number | null;
  billingStepMinutes: number | null;
  notes: string | null;
  rawLine: string | null;
}

export interface ExtractPriceRulesResponseDto {
  rules: ExtractedPriceRule[];
  /** Short remarks from the AI (ambiguities, assumptions). */
  warnings: string[];
  /** Source lines the AI returned but that could not be normalized. */
  skippedLines: string[];
}
