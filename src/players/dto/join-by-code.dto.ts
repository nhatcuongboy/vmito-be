import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  Min,
} from 'class-validator';
import { Gender } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinByCodeDto {
  @ApiProperty({
    description: 'Session code (last 8 characters of session ID)',
  })
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

  @ApiPropertyOptional({ description: 'Player skill level (1-7)' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ description: 'Player phone number' })
  @IsString()
  @IsOptional()
  phone?: string;
}
