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
import { VenueStatus } from '@prisma/client';

export class CreateVenueDto {
  @ApiProperty()
  @IsString()
  placeId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  address: string;

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

  @ApiProperty({ required: false, enum: VenueStatus, default: VenueStatus.ACTIVE })
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

  @ApiProperty({ required: false, example: 150000, description: 'Hourly rate for fixed members (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateFixed?: number;

  @ApiProperty({ required: false, example: 200000, description: 'Hourly rate for walk-in (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateWalkIn?: number;
}
