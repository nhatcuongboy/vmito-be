import { VenueManagerRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsString,
  IsTimeZone,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class AddVenueManagerDto {
  @IsString()
  userId!: string;

  @IsEnum(VenueManagerRole)
  role!: VenueManagerRole;
}

export class UpdateVenueManagerDto {
  @IsEnum(VenueManagerRole)
  role!: VenueManagerRole;
}

export class UpdateVenueRentalSettingsDto {
  @IsBoolean()
  rentalEnabled!: boolean;

  @IsString()
  @MaxLength(100)
  @IsTimeZone()
  timezone!: string;

  @IsBoolean()
  @IsOptional()
  courtSelectionEnabled?: boolean;
}
