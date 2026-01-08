import {
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  Min,
} from 'class-validator';
import { Gender, Level } from '@prisma/client';

export class CreatePlayerDto {
  @IsNumber()
  @Min(1)
  playerNumber: number;

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
}


