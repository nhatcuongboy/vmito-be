import {
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class CourtDto {
  @IsInt()
  @Min(1)
  courtNumber!: number;

  @IsOptional()
  @IsString()
  courtName?: string;
}

export class AddTournamentVenueDto {
  @IsString()
  venueId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourtDto)
  courts?: CourtDto[];
}
