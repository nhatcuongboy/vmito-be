import { IsOptional, IsString, IsIn, IsBooleanString } from 'class-validator';

export class ScoreboardQueryDto {
  // Defaults to IN_PROGRESS when omitted.
  @IsOptional()
  @IsIn(['IN_PROGRESS', 'SCHEDULED', 'FINISHED', 'CANCELLED'])
  status?: string;

  // Comma-separated TournamentCourt ids to filter by.
  @IsOptional()
  @IsString()
  courtIds?: string;

  // When "true", also include recently finished matches (kept on the board).
  @IsOptional()
  @IsBooleanString()
  includeFinished?: string;
}
