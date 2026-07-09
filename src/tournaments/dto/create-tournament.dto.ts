import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsIn(['BADMINTON', 'PICKLEBALL'])
  sportType?: string;
}
