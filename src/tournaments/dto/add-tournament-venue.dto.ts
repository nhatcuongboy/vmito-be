import {
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsInt,
  Min,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

class CourtDto {
  @IsInt()
  @Min(1)
  courtNumber!: number;

  @IsOptional()
  @IsString()
  courtName?: string;
}

/**
 * DTO for adding a venue to a tournament.
 *
 * Two modes are supported:
 *  - **Linked mode**: provide `venueId` to reference an existing Venue record.
 *  - **Inline mode**: omit `venueId` and provide address fields directly.
 *    No record is created in the `venues` table.
 */
export class AddTournamentVenueDto {
  // ── Linked mode ──────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  venueId?: string;

  // ── Inline mode (required when venueId is absent) ────────────────────────────
  @ValidateIf((o) => !o.venueId)
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  acronym?: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  // ── Courts (common) ──────────────────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourtDto)
  courts?: CourtDto[];
}
