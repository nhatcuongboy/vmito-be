import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateClubFeeDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maleFeeMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  femaleFeeMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maleFeePerSession?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  femaleFeePerSession?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
