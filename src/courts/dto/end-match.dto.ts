import { IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class EndMatchDto {
  @IsOptional()
  score?: string | Record<string, unknown>; // Can be object or string

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
