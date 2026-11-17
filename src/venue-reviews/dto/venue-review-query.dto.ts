import { ApiPropertyOptional } from '@nestjs/swagger';
import { VenueReviewStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class VenueReviewsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminVenueReviewsQueryDto extends VenueReviewsQueryDto {
  @ApiPropertyOptional({ enum: VenueReviewStatus })
  @IsOptional()
  @IsEnum(VenueReviewStatus)
  status?: VenueReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  venueId?: string;
}

export class UpdateVenueReviewStatusDto {
  @ApiPropertyOptional({ enum: VenueReviewStatus })
  @IsEnum(VenueReviewStatus)
  status: VenueReviewStatus;
}
