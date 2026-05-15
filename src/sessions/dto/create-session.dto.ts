import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  Min,
} from 'class-validator';
import { CourtDirection, FeeType, MatchType } from '@prisma/client';

export class CourtConfigDto {
  @IsNumber()
  courtNumber: number;

  @IsString()
  @IsOptional()
  courtName?: string;

  @IsEnum(CourtDirection)
  @IsOptional()
  direction?: CourtDirection;
}

export class VenueDto {
  @IsString()
  placeId: string;

  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  newAddress?: string;

  @IsString()
  @IsOptional()
  newDistrict?: string;

  @IsString()
  @IsOptional()
  newCity?: string;
}

export class FeeConfigDto {
  @IsEnum(FeeType)
  feeType: FeeType;

  @IsNumber()
  @IsOptional()
  maleFee?: number;

  @IsNumber()
  @IsOptional()
  femaleFee?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateSessionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  hostName?: string;

  @IsString()
  @IsOptional()
  hostPhone?: string;

  @IsOptional()
  venue?: VenueDto;

  @IsString()
  @IsOptional()
  hostId?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  numberOfCourts?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  sessionDuration?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxPlayersPerCourt?: number;

  @IsBoolean()
  @IsOptional()
  requirePlayerInfo?: boolean;

  @IsBoolean()
  @IsOptional()
  allowGuestJoin?: boolean;

  @IsBoolean()
  @IsOptional()
  allowNewPlayers?: boolean;

  @IsBoolean()
  @IsOptional()
  allowZaloContact?: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @IsOptional()
  requiredLevels?: number[];

  @IsString()
  @IsOptional()
  courtColor?: string;

  @IsString()
  @IsOptional()
  coverPhoto?: string;

  @IsString()
  @IsOptional()
  coverPhotoPublicId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imagePublicIds?: string[];

  @IsString()
  @IsOptional()
  shuttlecock?: string;

  @IsEnum(MatchType)
  @IsOptional()
  defaultMatchType?: MatchType;

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsArray()
  @IsOptional()
  courts?: CourtConfigDto[];

  @IsOptional()
  feeConfig?: FeeConfigDto;
}
