import { IsOptional, IsNumber, IsString, IsArray, IsIn } from 'class-validator';

export class UpdateWaitTimesDto {
  @IsOptional()
  @IsNumber()
  minutesToAdd?: number;

  @IsOptional()
  @IsIn(['current', 'total', 'both'])
  resetType?: 'current' | 'total' | 'both';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playerIds?: string[];
}
