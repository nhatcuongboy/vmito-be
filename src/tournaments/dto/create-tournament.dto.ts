import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  venueId?: string;
}
