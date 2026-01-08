import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Gender, Level } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinByCodeDto {
  @ApiProperty({ description: 'Session code (last 8 characters of session ID)' })
  @IsString()
  @IsNotEmpty()
  sessionCode: string;

  @ApiProperty({ description: 'Player name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ enum: Gender, description: 'Player gender' })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ enum: Level, description: 'Player skill level' })
  @IsEnum(Level)
  @IsOptional()
  level?: Level;

  @ApiPropertyOptional({ description: 'Player phone number' })
  @IsString()
  @IsOptional()
  phone?: string;
}
