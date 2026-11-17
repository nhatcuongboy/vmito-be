import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const VENUE_REVIEW_MAX_COMMENT_LENGTH = 500;

/** Trims the comment; blank strings become `undefined` (= no comment). */
const trimComment = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class SaveVenueReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: VENUE_REVIEW_MAX_COMMENT_LENGTH })
  @IsOptional()
  @Transform(trimComment)
  @IsString()
  @MaxLength(VENUE_REVIEW_MAX_COMMENT_LENGTH)
  comment?: string;
}
