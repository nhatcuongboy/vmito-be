import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RatingType } from '@prisma/client';

export class GetRatingsDto {
  @ApiPropertyOptional({ description: 'Filter by user ID (rater or rated)' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by session ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    enum: RatingType,
    description: 'Filter by rating type',
  })
  @IsOptional()
  @IsEnum(RatingType)
  type?: RatingType;

  @ApiPropertyOptional({ description: 'Filter by rater user ID' })
  @IsOptional()
  @IsString()
  raterUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by rated user ID' })
  @IsOptional()
  @IsString()
  ratedUserId?: string;
}
