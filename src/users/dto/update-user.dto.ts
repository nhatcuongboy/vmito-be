import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Role, Gender } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

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
  image?: string;
}
