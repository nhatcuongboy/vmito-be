import { IsOptional, IsBoolean, IsNumber, IsIn, IsObject, IsString } from 'class-validator';

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
}
