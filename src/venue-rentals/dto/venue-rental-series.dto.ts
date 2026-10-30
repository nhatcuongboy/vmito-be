import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VenueCustomerType } from '@prisma/client';
import { MAX_SERIES_WEEKS } from '../rental-series';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class RentalSeriesPlanDto {
  /** Venue-local `yyyy-MM-dd` of the first session. */
  @Matches(DATE_KEY)
  startDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SERIES_WEEKS)
  weeks!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  courtIds!: string[];

  @IsEnum(VenueCustomerType)
  customerType!: VenueCustomerType;
}

export class CreateRentalSeriesDto extends RentalSeriesPlanDto {
  @IsString()
  venueId!: string;

  @IsString()
  @MaxLength(120)
  contactName!: string;

  @IsString()
  @MaxLength(40)
  contactPhone!: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  /** Weeks the booker chose to leave out, usually because they clash. */
  @IsArray()
  @Matches(DATE_KEY, { each: true })
  @IsOptional()
  skipDates?: string[];
}

export class CreateManualRentalSeriesDto extends CreateRentalSeriesDto {
  @IsString()
  @IsOptional()
  requesterId?: string;
}

export class ExtendRentalSeriesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SERIES_WEEKS)
  weeks!: number;

  @IsArray()
  @Matches(DATE_KEY, { each: true })
  @IsOptional()
  skipDates?: string[];
}

export class SubmitSeriesPaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SERIES_WEEKS * 2)
  @IsString({ each: true })
  requestIds!: string[];

  @IsUrl({ require_tld: false })
  proofUrl!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  proofPublicId?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
