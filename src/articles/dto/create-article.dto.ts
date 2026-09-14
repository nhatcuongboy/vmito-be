import { ArticleCategory, ArticleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const ARTICLE_LOCALES = ['vi', 'en', 'cn'] as const;
export type ArticleLocale = (typeof ARTICLE_LOCALES)[number];

export class CreateArticleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  // Optional: the service derives one from the title when omitted.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  slug?: string;

  @IsIn(ARTICLE_LOCALES)
  locale: ArticleLocale;

  // Shared by rows that are translations of one another.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  translationGroupId?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(320)
  excerpt: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  coverImagePublicId?: string;

  @IsEnum(ArticleCategory)
  category: ArticleCategory;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  // Lets an editor backdate or schedule a post; defaults to now on publish.
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  // Overrides the value derived from the content length.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readingTimeMinutes?: number;
}
