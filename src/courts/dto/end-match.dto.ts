import { IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class EndMatchDto {
  @IsOptional()
  score?: any; // Can be object or string

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
}
