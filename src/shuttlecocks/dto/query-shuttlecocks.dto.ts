import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const SHUTTLECOCK_SORT_OPTIONS = [
  'popular',
  'rating',
  'price_asc',
  'price_desc',
  'durability',
] as const;

export type ShuttlecockSortOption = (typeof SHUTTLECOCK_SORT_OPTIONS)[number];

export class QueryShuttlecocksDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  speed?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  featherType?: string;

  @IsOptional()
  @IsIn(SHUTTLECOCK_SORT_OPTIONS)
  sort?: ShuttlecockSortOption = 'popular';
}
