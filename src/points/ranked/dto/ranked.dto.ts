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
import { RankedResultStatus, SportType } from '@prisma/client';
import { DISPUTE_REASONS, HONOR_PERIODS } from '../ranked.constants';
import type { DisputeReason, HonorPeriod } from '../ranked.constants';
import type { LeaderboardPeriod } from '../../points.constants';

export class DisputeResultDto {
  @IsIn(DISPUTE_REASONS)
  reason!: DisputeReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

const RANKED_STATUSES = ['VERIFIED', 'DISPUTED', 'REJECTED', 'INELIGIBLE'];

export class MyRankedMatchesQueryDto {
  /** Omitted = every match that went through the ranked system. */
  @IsOptional()
  @IsIn(RANKED_STATUSES)
  status?: RankedResultStatus;

  @IsOptional()
  @IsIn(Object.values(SportType))
  sport?: SportType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminRankedMatchesQueryDto extends MyRankedMatchesQueryDto {
  /** Matches this account played in. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}

export class RankedMeQueryDto {
  @IsOptional()
  @IsIn(Object.values(SportType))
  sport?: SportType;

  @IsOptional()
  @IsIn(['week', 'month', 'season', 'year', 'all'])
  period?: LeaderboardPeriod;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}(-(\d{2}(-\d{2})?|S[1-4]))?$/)
  periodKey?: string;
}

export class HonorQueryDto {
  @IsOptional()
  @IsIn(Object.values(SportType))
  sport?: SportType;

  @IsIn(HONOR_PERIODS)
  period!: HonorPeriod;

  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}(-(\d{2}|S[1-4]))?$/)
  periodKey!: string;
}

export class GenerateHonorReviewDto extends HonorQueryDto {}

export class HonorEntryDecisionDto {
  @IsIn(['APPROVED', 'EXCLUDED'])
  decision!: 'APPROVED' | 'EXCLUDED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewMatchDto {
  @IsIn(['VERIFIED', 'REJECTED'])
  status!: 'VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminPageQueryDto {
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
