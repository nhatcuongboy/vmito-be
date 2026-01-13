import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Gender } from '@prisma/client';

export class ConfirmPlayerDto {
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
}
