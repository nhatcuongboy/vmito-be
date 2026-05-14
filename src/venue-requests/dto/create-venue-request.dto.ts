import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { VenueRequestType } from '@prisma/client';
import { VenueRequestPayloadDto } from './venue-request-payload.dto';

export class CreateVenueRequestDto {
  @IsEnum(VenueRequestType)
  type!: VenueRequestType;

  @IsOptional()
  @IsString()
  venueId?: string;

  @ValidateNested()
  @Type(() => VenueRequestPayloadDto)
  payload!: VenueRequestPayloadDto;
}
