import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RatingType } from '@prisma/client';

export class CreateRatingDto {
  @ApiProperty({ description: 'Session ID' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'User ID being rated' })
  @IsString()
  ratedUserId: string;

  @ApiProperty({ enum: RatingType, description: 'Type of rating' })
  @IsEnum(RatingType)
  type: RatingType;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Rating (1-5 stars)' })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Optional comment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
