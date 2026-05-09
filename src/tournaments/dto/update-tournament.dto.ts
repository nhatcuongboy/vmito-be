import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  IsBoolean,
} from 'class-validator';

export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['PREPARING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsIn(['NEXT_AVAILABLE', 'ASSIGNED'])
  scheduleType?: string;

  @IsOptional()
  @IsString()
  venueId?: string;
}
