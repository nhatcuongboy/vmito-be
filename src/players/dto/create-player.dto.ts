import {
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  Min,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class CreatePlayerDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  playerNumber?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsNumber()
  @Min(1)
  @IsOptional()
  level?: number;

  @IsString()
  @IsOptional()
  levelDescription?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsBoolean()
  @IsOptional()
  preFilledByHost?: boolean;

  @IsBoolean()
  @IsOptional()
  confirmedByPlayer?: boolean;

  @IsBoolean()
  @IsOptional()
  requireConfirmInfo?: boolean;

  @IsBoolean()
  @IsOptional()
  isClubMember?: boolean;

  @IsString()
  @IsOptional()
  clubId?: string | null;

  // Deprecated: kept only so older clients that still send it don't get 400.
  // The value is ignored — the club's fixed per-session fee is applied instead.
  @IsOptional()
  customFee?: unknown;
}
