import { IsArray, IsOptional, IsString } from 'class-validator';

export class ApproveVenueRequestDto {
  // For IMAGE_CORRECTION requests: the subset of suggested-image publicIds the
  // admin selected to apply to the venue gallery. Omit to apply all of them.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applyImagePublicIds?: string[];
}
