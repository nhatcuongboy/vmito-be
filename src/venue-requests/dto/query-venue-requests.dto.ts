import { IsEnum, IsOptional } from 'class-validator';
import { VenueRequestStatus, VenueRequestType } from '@prisma/client';

export class QueryVenueRequestsDto {
  @IsOptional()
  @IsEnum(VenueRequestStatus)
  status?: VenueRequestStatus;

  @IsOptional()
  @IsEnum(VenueRequestType)
  type?: VenueRequestType;
}
