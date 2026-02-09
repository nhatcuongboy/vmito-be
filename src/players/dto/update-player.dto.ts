import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdatePlayerDto {
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
  desire?: string;

  @IsBoolean()
  @IsOptional()
  confirmedByPlayer?: boolean;

  @IsBoolean()
  @IsOptional()
  preFilledByHost?: boolean;

  @IsBoolean()
  @IsOptional()
  requireConfirmInfo?: boolean;

  @IsBoolean()
  @IsOptional()
  isClubMember?: boolean;

  @IsString()
  @IsOptional()
  clubId?: string;
}
