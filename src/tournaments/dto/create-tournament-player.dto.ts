import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';

export class CreateTournamentPlayerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  level?: number;

  @IsOptional()
  @IsString()
  levelDescription?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdateTournamentPlayerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  level?: number;

  @IsOptional()
  @IsString()
  levelDescription?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class BulkTournamentPlayerRowDto {
  @ApiPropertyOptional({
    description: 'Original row number from the pasted data',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  lineNumber?: number;

  @ApiPropertyOptional({
    description: 'Human-readable player code. If omitted, BE generates VDVxxx.',
    example: 'VDV001',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Gender input. Accepts enum values and common labels such as Nam/Male/M, Nữ/Female/F.',
    example: 'Nam',
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class BulkTournamentPlayersDto {
  @ApiProperty({ type: [BulkTournamentPlayerRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkTournamentPlayerRowDto)
  rows: BulkTournamentPlayerRowDto[];
}
