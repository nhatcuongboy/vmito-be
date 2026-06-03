import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  IsObject,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['ROUND_ROBIN', 'SINGLE_ELIMINATION', 'ROUND_ROBIN_TO_SE'])
  format?: string;

  @IsOptional()
  @IsObject()
  formatConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  hasGroupStage?: boolean;

  @IsOptional()
  @IsNumber()
  averageMatchDuration?: number;

  @IsOptional()
  @IsNumber()
  groupCount?: number;

  @IsOptional()
  @IsNumber()
  winnersPerGroup?: number;

  @IsOptional()
  @IsNumber()
  playersPerGroup?: number;

  @IsOptional()
  @IsIn(['BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5'])
  matchFormat?: string;

  @IsOptional()
  @IsIn(['BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5'])
  eliminationMatchFormat?: string;

  @IsOptional()
  @IsBoolean()
  thirdPlaceMatch?: boolean;

  // ─── Per-set scoring rules (preset or custom override) ──────────────
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  pointsToWin?: number;

  @IsOptional()
  @IsBoolean()
  winByTwo?: boolean;

  /** Null to disable the hard cap; integer to enforce it. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  pointCap?: number | null;

  // ─── Per-stage scoring overrides (null = inherit) ──────────────────
  /** Knockout-stage override for pointsToWin. Null = inherit from base. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  knockoutPointsToWin?: number | null;

  @IsOptional()
  @IsBoolean()
  knockoutWinByTwo?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  knockoutPointCap?: number | null;

  /** Final-stage override for pointsToWin. Null = inherit (knockout → base). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  finalPointsToWin?: number | null;

  @IsOptional()
  @IsBoolean()
  finalWinByTwo?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  finalPointCap?: number | null;

  @IsOptional()
  @IsIn([
    'MENS_SINGLE',
    'WOMENS_SINGLE',
    'MENS_DOUBLE',
    'WOMENS_DOUBLE',
    'MIXED_DOUBLE',
    'CUSTOM',
  ])
  type?: string;

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'TEAM'])
  registrationMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  teamSize?: number;
}
