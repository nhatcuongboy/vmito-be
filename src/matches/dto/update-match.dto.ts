import { IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class UpdateMatchDto {
  @IsOptional()
  score?: any;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  winnerIds?: string[];

  @IsOptional()
  @IsBoolean()
  isDraw?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isExtra?: boolean;
}
