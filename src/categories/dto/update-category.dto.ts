import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  IsObject,
  IsString,
  IsInt,
  Min,
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
