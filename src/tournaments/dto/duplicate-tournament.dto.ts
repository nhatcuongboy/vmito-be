import {
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsDefined,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Which parts of the source tournament to copy. `format` (categories + their
 * format configuration) is always copied, so it is accepted but ignored.
 *
 * Dependencies enforced by the service:
 *  - group assignments & match participants need `teams`
 *  - court time slots & per-match court assignments need `venues`
 *  - `matchResults` is accepted for API compatibility but never carries scores
 *    over — a duplicated tournament always starts unplayed (see service).
 */
export class DuplicateCopyOptionsDto {
  @IsOptional()
  @IsBoolean()
  format?: boolean;

  @IsOptional()
  @IsBoolean()
  schedule?: boolean;

  @IsOptional()
  @IsBoolean()
  teams?: boolean;

  @IsOptional()
  @IsBoolean()
  venues?: boolean;

  @IsOptional()
  @IsBoolean()
  matchResults?: boolean;

  @IsOptional()
  @IsBoolean()
  customHomePage?: boolean;
}

export class DuplicateTournamentDto {
  @IsString()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  // Top-level venue for the new tournament. May be null to clear it.
  @IsOptional()
  @IsString()
  venueId?: string | null;

  @IsDefined()
  @ValidateNested()
  @Type(() => DuplicateCopyOptionsDto)
  copy: DuplicateCopyOptionsDto;
}
