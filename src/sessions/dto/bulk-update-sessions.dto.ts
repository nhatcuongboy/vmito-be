import { PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

import { UpdateSessionDto } from './update-session.dto';

/**
 * The subset of a session a bulk edit may change. Identity, media and court
 * layout stay per-session edits: they rarely share a value across sessions,
 * and a mistake there is expensive to undo many times over.
 */
export class BulkSessionChangesDto extends PickType(UpdateSessionDto, [
  'registrationOpen',
  'isInternal',
  'allowGuestJoin',
  'allowNewPlayers',
  'allowZaloContact',
  'autoCheckIn',
  'requiredLevels',
  'feeConfig',
  'shuttlecock',
  'maxPlayersPerCourt',
  'defaultMatchType',
  'hostPhone',
  'startTime',
  'endTime',
  'sessionDuration',
  'locationType',
  'venueId',
] as const) {}

export class BulkSessionUpdateItemDto {
  @IsString()
  id: string;

  @ValidateNested()
  @Type(() => BulkSessionChangesDto)
  changes: BulkSessionChangesDto;
}

/**
 * Per-item changes rather than one shared patch: a time-of-day edit keeps
 * each session's own date, so the client computes a different start/end for
 * every session.
 */
export class BulkUpdateSessionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkSessionUpdateItemDto)
  items: BulkSessionUpdateItemDto[];
}
