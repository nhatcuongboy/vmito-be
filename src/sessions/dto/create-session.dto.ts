import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CourtDirection, FeeType, MatchType, SportType } from '@prisma/client';

export class CourtConfigDto {
  @IsString()
  @IsOptional()
  id?: string;

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

export enum SessionLocationType {
  VENUE = 'VENUE',
  CUSTOM = 'CUSTOM',
}

export class CustomSessionLocationDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  address?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  placeId?: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  district?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;
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

  @ApiProperty({
    required: false,
    enum: SportType,
    default: SportType.BADMINTON,
    description: 'Sport of the session. Must be supported by the linked venue.',
  })
  @IsEnum(SportType)
  @IsOptional()
  sportType?: SportType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  location?: string;

  @IsEnum(SessionLocationType)
  @IsOptional()
  locationType?: SessionLocationType;

  @IsString()
  @IsOptional()
  venueId?: string;

  @ValidateNested()
  @Type(() => CustomSessionLocationDto)
  @IsOptional()
  customLocation?: CustomSessionLocationDto;

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

  @IsString()
  @IsOptional()
  clubId?: string | null;

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

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : (value as string | null)
  )
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @IsOptional()
  referenceVideoUrl?: string | null;

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
