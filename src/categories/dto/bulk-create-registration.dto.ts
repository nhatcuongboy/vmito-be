import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkCreateRegistrationDto {
  // Create brand-new entries. For TEAM categories each name becomes a new pair
  // (empty roster); for INDIVIDUAL categories each name becomes a new player.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  names?: string[];

  // Register existing tournament players (INDIVIDUAL categories) selected from
  // the shared "Players" list. Already-registered players are skipped.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  tournamentPlayerIds?: string[];

  // Everything is created in a single request + transaction so the client makes
  // one round-trip instead of two calls per row.
}
