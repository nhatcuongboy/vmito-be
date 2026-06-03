import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Overwrite the score of a single set. Used when a referee needs to correct a
 * past (already-completed) set, or fix the current set's tally. The server
 * rewrites the point log so that earlier sets are preserved and any later sets
 * are discarded (the user must re-enter them).
 */
export class UpdateSetScoreDto {
  @IsInt()
  @Min(0)
  player1Score: number;

  @IsInt()
  @Min(0)
  player2Score: number;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsInt()
  seq?: number;
}
