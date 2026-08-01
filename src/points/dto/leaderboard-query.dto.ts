import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SportType } from '@prisma/client';
import type { LeaderboardPeriod, PointsBoard } from '../points.constants';

export class LeaderboardQueryDto {
  @IsOptional()
  @IsIn(Object.values(SportType))
  sport?: SportType;

  @IsOptional()
  @IsIn(['week', 'month', 'season', 'year', 'all'])
  period?: LeaderboardPeriod;

  /** `2026-07-27` (week), `2026-08` (month), `2026-S3` (season), `2026` (year). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}(-(\d{2}(-\d{2})?|S[1-4]))?$/)
  periodKey?: string;

  /** Hosting rewards are ranked apart from playing. */
  @IsOptional()
  @IsIn(['player', 'host'])
  board?: PointsBoard;

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
