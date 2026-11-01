import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VenueRequestStatus, VenueRequestType } from '@prisma/client';

export class QueryVenueRequestsDto {
  @IsOptional()
  @IsEnum(VenueRequestStatus)
  status?: VenueRequestStatus;

  @IsOptional()
  @IsEnum(VenueRequestType)
  type?: VenueRequestType;

  // Lets a client ask "do I already have a request on this venue?".
  @IsOptional()
  @IsString()
  venueId?: string;
}
