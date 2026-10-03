import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SportType } from '@prisma/client';

export const CLASS_PERIODS = ['morning', 'afternoon', 'evening'] as const;
export type ClassPeriodValue = (typeof CLASS_PERIODS)[number];

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

// The mobile app sends multi-value filters as one comma-separated string
// (e.g. `daysOfWeek=1,3,5`), matching the clubs browse DTO.
const toStringArray = ({ value }: { value: unknown }): string[] =>
  Array.isArray(value)
    ? (value as string[])
    : (typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : ''
      )
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

const toIntArray = ({ value }: { value: unknown }): number[] =>
  toStringArray({ value })
    .map(Number)
    .filter((n) => Number.isInteger(n));

export class BrowseClassesDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(SportType) sportType?: SportType;
  // Comma-separated level ids, e.g. "3,9".
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() city?: string;
  // Comma-separated wards/districts; a single web value is a one-element list.
  @IsOptional() @IsString() district?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  // Multi-day variant of `dayOfWeek` (0 = Sunday … 6 = Saturday).
  @IsOptional()
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];
  // Time-of-day buckets a lesson overlaps, comma-separated.
  @IsOptional()
  @Transform(toStringArray)
  @IsIn(CLASS_PERIODS, { each: true })
  periods?: ClassPeriodValue[];
  @IsOptional() @IsString() timeFrom?: string;
  @IsOptional() @IsString() timeTo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minTuition?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxTuition?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  @IsOptional() @IsString() sortBy?: 'distance' | 'newest' | 'recommended';
  @IsOptional() @Transform(toBoolean) @IsBoolean() favoriteOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
