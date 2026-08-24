import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { VenueRequestPayloadDto } from './venue-request-payload.dto';

export class UpdateVenueRequestDto {
  @ValidateNested()
  @Type(() => VenueRequestPayloadDto)
  payload!: VenueRequestPayloadDto;
}
