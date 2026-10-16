import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CreateVenuePriceBookDto,
  CreateVenuePriceRuleDto,
} from './venue-pricing.dto';

export const MAX_IMPORTED_PRICE_RULES = 300;

export class BulkCreateVenuePriceRulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORTED_PRICE_RULES)
  @ValidateNested({ each: true })
  @Type(() => CreateVenuePriceRuleDto)
  rules!: CreateVenuePriceRuleDto[];

  /** When true, every existing rule of the price book is removed first. */
  @IsBoolean()
  @IsOptional()
  replaceExisting?: boolean;
}

export class ImportVenuePriceBookDto {
  @ValidateNested()
  @Type(() => CreateVenuePriceBookDto)
  book!: CreateVenuePriceBookDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORTED_PRICE_RULES)
  @ValidateNested({ each: true })
  @Type(() => CreateVenuePriceRuleDto)
  rules!: CreateVenuePriceRuleDto[];
}
