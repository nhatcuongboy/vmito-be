import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  ValidateNested,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSessionDto } from './create-session.dto';

export enum BulkCreationMode {
  SINGLE = 'single',
  SPECIFIC_DATES = 'specific-dates',
  RECURRING_WEEKDAYS = 'recurring-weekdays',
}

export class SpecificDatesConfigDto {
  @IsArray()
  @IsDateString({}, { each: true })
  @ArrayMinSize(1, { message: 'At least one date is required' })
  dates: string[];
}

export class RecurringWeekdaysConfigDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMinSize(1, { message: 'At least one weekday is required' })
  weekdays: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  @IsNumber()
  @Min(1)
  @Max(52)
  numberOfWeeks: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;
}

export class BulkSessionCreationDto {
  @IsEnum(BulkCreationMode)
  mode: BulkCreationMode;

  @ValidateNested()
  @Type(() => CreateSessionDto)
  baseSession: CreateSessionDto;

  @ValidateNested()
  @Type(() => SpecificDatesConfigDto)
  @IsOptional()
  specificDates?: SpecificDatesConfigDto;

  @ValidateNested()
  @Type(() => RecurringWeekdaysConfigDto)
  @IsOptional()
  recurringWeekdays?: RecurringWeekdaysConfigDto;
}

export class BulkSessionErrorDto {
  @IsString()
  date: string;

  @IsString()
  error: string;
}

export class BulkSessionCreationResponseDto {
  success: boolean;
  sessionsCreated: number;
  sessions: any[]; // Will be actual Session entities
  errors?: BulkSessionErrorDto[];
}
