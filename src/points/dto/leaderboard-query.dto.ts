import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SportType } from '@prisma/client';
import type { LeaderboardPeriod } from '../points.constants';

export class LeaderboardQueryDto {
  @IsOptional()
  @IsIn(Object.values(SportType))
  sport?: SportType;

  @IsOptional()
  @IsIn(['week', 'month', 'year', 'all'])
  period?: LeaderboardPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AchievementsQueryDto {
  @IsOptional()
  @IsIn(Object.values(SportType))
  sport?: SportType;
}
