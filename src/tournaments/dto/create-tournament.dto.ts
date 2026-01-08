import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
  IsIn,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class CategoryDto {
  @IsString()
  name: string;

  @IsIn(['MENS_SINGLES', 'WOMENS_SINGLES', 'MENS_DOUBLES', 'WOMENS_DOUBLES', 'MIXED_DOUBLES'])
  type: string;
}

class UmpireDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

class ScoringDeviceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  deviceType?: string;
}

class CourtDto {
  @IsNumber()
  courtNumber: number;

  @IsOptional()
  @IsString()
  courtName?: string;
}

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDto)
  categories: CategoryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UmpireDto)
  umpires?: UmpireDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoringDeviceDto)
  scoringDevices?: ScoringDeviceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourtDto)
  courts?: CourtDto[];
}
