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
import { Level, CourtDirection } from '@prisma/client';

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

export class CreateSessionDto {
  @IsString()
  name: string;

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
  @IsEnum(Level, { each: true })
  @IsOptional()
  requiredLevels?: Level[];

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsArray()
  @IsOptional()
  courts?: CourtConfigDto[];
}


