import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClubReviewStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SaveVenueReviewDto } from '../../venue-reviews/dto/save-venue-review.dto';
import { VenueReviewsQueryDto } from '../../venue-reviews/dto/venue-review-query.dto';

/** Same shape and validation as a venue review: rating 1-5, trimmed comment ≤500. */
export class SaveClubReviewDto extends SaveVenueReviewDto {}

export class ClubReviewsQueryDto extends VenueReviewsQueryDto {}

export class AdminClubReviewsQueryDto extends VenueReviewsQueryDto {
  @ApiPropertyOptional({ enum: ClubReviewStatus })
  @IsOptional()
  @IsEnum(ClubReviewStatus)
  status?: ClubReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clubId?: string;
}

export class UpdateClubReviewStatusDto {
  @ApiProperty({ enum: ClubReviewStatus })
  @IsEnum(ClubReviewStatus)
  status: ClubReviewStatus;
}
