import {
  IsString,
  IsIn,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsIn([
    'MENS_SINGLE',
    'WOMENS_SINGLE',
    'MENS_DOUBLE',
    'WOMENS_DOUBLE',
    'MIXED_DOUBLE',
    'CUSTOM',
  ])
  type: string;

  @IsOptional()
  @IsIn(['ROUND_ROBIN', 'SINGLE_ELIMINATION', 'ROUND_ROBIN_TO_SE'])
  format?: string;

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'TEAM'])
  registrationMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  teamSize?: number;

  // ─── Per-set scoring rules (optional; defaults to BWF 21 / win-by-2 / cap 30) ──
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  pointsToWin?: number;

  @IsOptional()
  @IsBoolean()
  winByTwo?: boolean;

  /** Null = no hard cap. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  pointCap?: number | null;
}
