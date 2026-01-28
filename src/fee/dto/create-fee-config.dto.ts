import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FeeType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeeConfigDto {
  @ApiProperty({ enum: FeeType, description: 'Fee type: FIXED or SPLIT_EVENLY' })
  @IsEnum(FeeType)
  feeType: FeeType;

  @ApiPropertyOptional({ description: 'Fee for male players (in VND)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maleFee?: number;

  @ApiPropertyOptional({ description: 'Fee for female players (in VND)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  femaleFee?: number;

  @ApiPropertyOptional({ description: 'Notes about the fee' })
  @IsString()
  @IsOptional()
  notes?: string;
}
