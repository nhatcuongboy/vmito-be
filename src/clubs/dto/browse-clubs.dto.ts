import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsNumber,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const CLUB_ACTIVITY_PERIODS = [
  'morning',
  'afternoon',
  'evening',
] as const;
export type ClubActivityPeriodValue = (typeof CLUB_ACTIVITY_PERIODS)[number];

// Query params arrive as a single comma-separated string (matching how the
// app sends multi-value filters, e.g. `levels=3,9`); split and coerce here so
// the rest of the DTO/service works with plain arrays.
const toStringArray = ({ value }: { value: unknown }): string[] =>
  Array.isArray(value)
    ? (value as string[])
    : String(value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

const toIntArray = ({ value }: { value: unknown }): number[] =>
  toStringArray({ value })
    .map(Number)
    .filter((n) => Number.isInteger(n));

export class BrowseClubsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favoriteOnly?: boolean;

  // Required player level ids, comma-separated (e.g. "3,9"). A club with an
  // empty `requiredLevels` (open to all levels) still matches — see
  // ClubsService.browsePublicClubs.
  @IsOptional()
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10, { each: true })
  levels?: number[];

  // Weekday numbers the club has an active recurring schedule on,
  // comma-separated. 0 = Sunday … 6 = Saturday (matches `ClubSchedule.dayOfWeek`).
  @IsOptional()
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  activeDays?: number[];

  // Buổi (time-of-day bucket) the club has an active recurring schedule
  // overlapping, comma-separated.
  @IsOptional()
  @Transform(toStringArray)
  @IsIn(CLUB_ACTIVITY_PERIODS, { each: true })
  activePeriods?: ClubActivityPeriodValue[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number = 10;
}
