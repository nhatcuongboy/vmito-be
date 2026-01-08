import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Gender, Level } from '@prisma/client';

export class UpdatePlayerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsEnum(Level)
  @IsOptional()
  level?: Level;

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
}


