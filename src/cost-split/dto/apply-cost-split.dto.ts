import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ApplyCostSplitDto {
  @ApiProperty({ description: 'Extra VND each male player pays', example: 0 })
  @IsInt()
  @Min(0)
  maleSurcharge: number;

  @ApiProperty({ type: [String], description: 'Players left out of the split' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  excludedPlayerIds: string[];

  @ApiProperty({ description: 'Amount per male player the host saw' })
  @IsInt()
  @Min(0)
  expectedMaleAmount: number;

  @ApiProperty({ description: 'Amount per female player the host saw' })
  @IsInt()
  @Min(0)
  expectedFemaleAmount: number;

  @ApiPropertyOptional({
    description: 'Required to replace a published FIXED price',
  })
  @IsOptional()
  @IsBoolean()
  confirmFeeTypeChange?: boolean;
}
