import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  VenueCustomerType,
  VenueRentalSelectionMode,
  VenueRentalStatus,
} from '@prisma/client';

/** Max segments in one multi-segment quote. */
export const MAX_RENTAL_SEGMENTS = 12;

/** One time range on one or more specific courts. */
export class RentalSegmentDto {
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  courtIds!: string[];
}

export class CreateRentalQuoteDto {
  // With `segments`, the single-range fields are derived server-side, so
  // they are only required for the classic single-range shape.
  @ValidateIf((dto: CreateRentalQuoteDto) => !dto.segments)
  @IsDateString()
  startTime!: string;

  @ValidateIf((dto: CreateRentalQuoteDto) => !dto.segments)
  @IsDateString()
  endTime!: string;

  @ValidateIf((dto: CreateRentalQuoteDto) => !dto.segments)
  @IsInt()
  @Min(1)
  numberOfCourts!: number;

  @IsEnum(VenueCustomerType)
  customerType!: VenueCustomerType;

  @IsEnum(VenueRentalSelectionMode)
  @IsOptional()
  selectionMode: VenueRentalSelectionMode =
    VenueRentalSelectionMode.AUTO_ASSIGN;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courtIds?: string[];

  /**
   * Multi-segment booking (court-selection venues only): different time
   * ranges on different courts of the same day, in one request.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RENTAL_SEGMENTS)
  @ValidateNested({ each: true })
  @Type(() => RentalSegmentDto)
  @IsOptional()
  segments?: RentalSegmentDto[];
}

export class RentalAvailabilityDto {
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;
}

export class CreateVenueRentalDto {
  @IsString()
  quoteId!: string;

  @IsString()
  @MaxLength(120)
  contactName!: string;

  @IsString()
  @MaxLength(40)
  contactPhone!: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}

export class RentalReasonDto {
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}

export class LinkRentalSessionDto {
  @IsString()
  sessionId!: string;
}

export class CreateRentalProposalDto extends CreateRentalQuoteDto {}

export class ReallocateRentalCourtsDto {
  @IsArray()
  @IsString({ each: true })
  courtIds!: string[];
}

export class CreateManualRentalDto extends CreateRentalQuoteDto {
  @IsString()
  @MaxLength(120)
  contactName!: string;

  @IsString()
  @MaxLength(40)
  contactPhone!: string;

  @IsString()
  @IsOptional()
  requesterId?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @IsString()
  venueId!: string;
}

/** Venue-local `yyyy-MM-dd` days, both inclusive. */
export class RentalReportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class QueryVenueRentalsDto {
  @IsEnum(VenueRentalStatus)
  @IsOptional()
  status?: VenueRentalStatus;

  @IsString()
  @IsOptional()
  venueId?: string;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;
}
