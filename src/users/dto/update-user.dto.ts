import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Role, Gender, Level } from '@prisma/client';

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

  @IsEnum(Level)
  @IsOptional()
  level?: Level;

  @IsString()
  @IsOptional()
  levelDescription?: string;

  @IsString()
  @IsOptional()
  image?: string;
}


