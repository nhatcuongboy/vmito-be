import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
  @MaxLength(2000)
  note?: string;
}
