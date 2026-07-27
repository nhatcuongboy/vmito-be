import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  IsDateString,
  IsEnum,
  IsUrl,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MatchType } from '@prisma/client';

import { VenueDto, FeeConfigDto, CourtConfigDto } from './create-session.dto';

export class UpdateSessionDto {
  @IsString()
  @IsOptional()
  name?: string;

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

  @IsOptional()
  feeConfig?: FeeConfigDto | null;

  @IsArray()
  @IsOptional()
  courts?: CourtConfigDto[];
}
