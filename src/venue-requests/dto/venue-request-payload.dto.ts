import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SuggestedImageDto {
  @IsString()
  @MaxLength(1000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicId?: string;
}

export class VenueRequestPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfCourts?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  openingHours?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateFixed?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateWalkIn?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locatedWithin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bookingPolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  // Price-table correction: a photo of the venue's price board.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  priceImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  priceImagePublicId?: string;

  // Image correction: suggested venue photos.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SuggestedImageDto)
  suggestedImages?: SuggestedImageDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
