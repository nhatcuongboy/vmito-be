import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TournamentLocationDto {
  @IsOptional()
  @IsString()
  placeId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  acronym?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

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

  /**
   * Raw location picked at creation time. The service resolves it to an
   * existing Venue by placeId (linked mode) or stores it inline on
   * TournamentVenue — it never creates a new Venue record.
   * Ignored when venueId is provided.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => TournamentLocationDto)
  location?: TournamentLocationDto;

  @IsOptional()
  @IsIn(['BADMINTON', 'PICKLEBALL'])
  sportType?: string;
}
