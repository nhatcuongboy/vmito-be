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
import { CourtDirection } from '@prisma/client';

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
}

export class CreateSessionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

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

  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @IsOptional()
  requiredLevels?: number[];

  @IsString()
  @IsOptional()
  courtColor?: string;

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
  feeConfig?: any;

  @IsOptional()
  host?: any;

  @IsOptional()
  players?: any;

  @IsOptional()
  pendingPlayers?: any;

  @IsOptional()
  _count?: any;
}
