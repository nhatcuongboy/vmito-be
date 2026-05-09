import {
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CourtConstraintDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  rounds?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  groups?: string[] = [];
}

export class CourtTimeSlotDto {
  @IsString()
  courtId!: string;

  @ValidateNested()
  @Type(() => CourtConstraintDto)
  @IsOptional()
  constraints?: CourtConstraintDto;
}

export class TimeSlotDto {
  @IsISO8601()
  date!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime!: string;

  @IsInt()
  @Min(0)
  @Max(180)
  timeBuffer!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourtTimeSlotDto)
  courts!: CourtTimeSlotDto[];
}

export class MatchDurationsDto {
  @IsInt()
  @Min(5)
  @Max(180)
  POOL_PLAY!: number;

  @IsInt()
  @Min(5)
  @Max(180)
  PLAYOFFS!: number;
}

export class GenerateScheduleDto {
  @IsArray()
  @IsString({ each: true })
  categoryPriorities!: string[];

  @ValidateNested()
  @Type(() => MatchDurationsDto)
  matchDurations!: MatchDurationsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots!: TimeSlotDto[];

  @IsBoolean()
  keepScheduledMatches!: boolean;
}
