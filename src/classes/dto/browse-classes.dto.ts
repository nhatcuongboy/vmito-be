import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SportType } from '@prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class BrowseClassesDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(SportType) sportType?: SportType;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @IsString() timeFrom?: string;
  @IsOptional() @IsString() timeTo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minTuition?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxTuition?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  @IsOptional() @IsString() sortBy?: 'distance' | 'newest';
  @IsOptional() @Transform(toBoolean) @IsBoolean() favoriteOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
