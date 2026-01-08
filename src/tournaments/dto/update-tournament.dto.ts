import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

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
}
