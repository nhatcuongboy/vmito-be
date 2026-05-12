import { IsOptional, IsString, IsBoolean, IsArray, IsNumber, Min } from 'class-validator';

export class UpdateMatchDto {
  @IsOptional()
  score?: string | Record<string, unknown>;

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playerIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  shuttlecockCount?: number;
}
