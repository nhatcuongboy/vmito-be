import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { VenueCustomerType, VenueDayType } from '@prisma/client';

export class CreateVenuePriceBookDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsString()
  @IsOptional()
  priceImageUrl?: string | null;

  @IsString()
  @IsOptional()
  priceImagePublicId?: string | null;
}

export class UpdateVenuePriceBookDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsString()
  @IsOptional()
  priceImageUrl?: string | null;

  @IsString()
  @IsOptional()
  priceImagePublicId?: string | null;
}

export class CreateVenuePriceRuleDto {
  @IsEnum(VenueDayType)
  dayType!: VenueDayType;

  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsDateString()
  @IsOptional()
  specificDate?: string | null;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;

  @IsEnum(VenueCustomerType)
  customerType!: VenueCustomerType;

  @IsInt()
  @Min(0)
  pricePerHour!: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  minimumMinutes?: number | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  billingStepMinutes?: number | null;

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class UpdateVenuePriceRuleDto {
  @IsEnum(VenueDayType)
  @IsOptional()
  dayType?: VenueDayType;

  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsDateString()
  @IsOptional()
  specificDate?: string | null;

  @IsInt()
  @Min(0)
  @Max(1439)
  @IsOptional()
  startMinute?: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  endMinute?: number;

  @IsEnum(VenueCustomerType)
  @IsOptional()
  customerType?: VenueCustomerType;

  @IsInt()
  @Min(0)
  @IsOptional()
  pricePerHour?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  minimumMinutes?: number | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  billingStepMinutes?: number | null;

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class CalculateVenueRentalPriceDto {
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsInt()
  @Min(1)
  numberOfCourts!: number;

  @IsEnum(VenueCustomerType)
  customerType!: VenueCustomerType;
}
