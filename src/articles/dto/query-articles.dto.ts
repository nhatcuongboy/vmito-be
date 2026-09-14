import { ArticleCategory, ArticleStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ARTICLE_LOCALES } from './create-article.dto';
import type { ArticleLocale } from './create-article.dto';

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class QueryArticlesDto {
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

  @IsOptional()
  @IsIn(ARTICLE_LOCALES)
  locale?: ArticleLocale;

  @IsOptional()
  @IsEnum(ArticleCategory)
  category?: ArticleCategory;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  featured?: boolean;

  // Excludes a slug from the results — used by the "related articles" rail so
  // the article being read never lists itself.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  excludeSlug?: string;
}

/**
 * Admin listing: same filters as the public one plus the ability to see
 * non-published rows.
 */
export class QueryAdminArticlesDto extends QueryArticlesDto {
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;
}
