import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  IsEnum,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VenueStatus, ClosureStatus, SportType } from '@prisma/client';

export class CreateVenueDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({
    required: false,
    enum: SportType,
    description: 'Sport played at the venue (default BADMINTON)',
  })
  @IsOptional()
  @IsEnum(SportType)
  sportType?: SportType;

  @ApiProperty({ required: false, description: 'Venue acronym' })
  @IsOptional()
  @IsString()
  acronym?: string;

  @ApiProperty({ required: false, description: 'Venue description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false, description: 'New ward/district name' })
  @IsOptional()
  @IsString()
  newDistrict?: string;

  @ApiProperty({
    required: false,
    description: 'New city/province name if changed',
  })
  @IsOptional()
  @IsString()
  newCity?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({ required: false, example: '6:00 AM - 11:00 PM' })
  @IsOptional()
  @IsString()
  openingHours?: string;

  @ApiProperty({ required: false, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfCourts?: number;

  @ApiProperty({
    required: false,
    enum: VenueStatus,
    default: VenueStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(VenueStatus)
  status?: VenueStatus;

  @ApiProperty({ required: false, example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: 'https://example.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({
    required: false,
    example: 150000,
    description: 'Hourly rate for fixed members (VND)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateFixed?: number;

  @ApiProperty({
    required: false,
    example: 200000,
    description: 'Hourly rate for walk-in (VND)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateWalkIn?: number;

  @ApiProperty({ required: false, description: 'Has car parking available' })
  @IsOptional()
  @IsBoolean()
  hasCarParking?: boolean;

  @ApiProperty({ required: false, description: 'Has canteen available' })
  @IsOptional()
  @IsBoolean()
  hasCanteen?: boolean;

  @ApiProperty({ required: false, example: 'VenueWiFi' })
  @IsOptional()
  @IsString()
  wifiName?: string;

  @ApiProperty({ required: false, example: '12345678' })
  @IsOptional()
  @IsString()
  wifiPassword?: string;

  @ApiProperty({
    required: false,
    enum: ClosureStatus,
    default: ClosureStatus.OPERATING,
    description: 'Closure status of the venue',
  })
  @IsOptional()
  @IsEnum(ClosureStatus)
  closureStatus?: ClosureStatus;

  @ApiProperty({ required: false, description: 'Booking policy information' })
  @IsOptional()
  @IsString()
  bookingPolicy?: string;

  @ApiProperty({
    required: false,
    description: 'Name of the larger facility this venue is located within',
  })
  @IsOptional()
  @IsString()
  locatedWithin?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  coverPhoto?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  coverPhotoPublicId?: string;

  @ApiProperty({
    required: false,
    description: 'URL of the court layout/diagram image',
  })
  @IsOptional()
  @IsString()
  courtLayoutImage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  courtLayoutImagePublicId?: string;

  @ApiProperty({
    required: false,
    description: 'URL of the venue logo/avatar image',
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logoPublicId?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  images?: string[] = [];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  imagePublicIds?: string[] = [];
}
