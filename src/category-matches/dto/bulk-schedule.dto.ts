import {
  IsArray,
  IsOptional,
  IsString,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkScheduleItemDto {
  @IsString()
  matchId: string;

  @IsOptional()
  @IsString()
  courtId?: string | null;

  @IsOptional()
  @IsDateString()
  startTime?: string | null;

  @IsOptional()
  @IsDateString()
  endTime?: string | null;
}

export class BulkScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkScheduleItemDto)
  updates: BulkScheduleItemDto[];
}
