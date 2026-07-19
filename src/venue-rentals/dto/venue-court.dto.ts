import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  VenueCourtBlockType,
  VenueCourtStatus,
  VenueCustomerType,
} from '@prisma/client';

export class CreateVenueCourtDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsEnum(VenueCourtStatus)
  @IsOptional()
  status?: VenueCourtStatus;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class UpdateVenueCourtDto {
  @IsString()
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(40)
  @IsOptional()
  code?: string;

  @IsEnum(VenueCourtStatus)
  @IsOptional()
  status?: VenueCourtStatus;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class OperatingPeriodDto {
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class ReplaceOperatingPeriodsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OperatingPeriodDto)
  periods!: OperatingPeriodDto[];

  @IsBoolean()
  @IsOptional()
  markReviewed = false;
}

export class CreateCourtBlockDto {
  @IsString()
  @IsOptional()
  courtId?: string;

  @IsEnum(VenueCourtBlockType)
  type!: VenueCourtBlockType;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}

export class CourtScheduleQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsEnum(VenueCustomerType)
  @IsOptional()
  customerType: VenueCustomerType = VenueCustomerType.WALK_IN;
}

export class ManagerCourtScheduleQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
