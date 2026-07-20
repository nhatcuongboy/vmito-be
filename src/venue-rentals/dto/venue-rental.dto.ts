import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  VenueCustomerType,
  VenueRentalSelectionMode,
  VenueRentalStatus,
} from '@prisma/client';

export class CreateRentalQuoteDto {
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

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
