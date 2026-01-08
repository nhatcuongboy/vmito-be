import { IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';

export class UpdateCategoryDto {
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
}
