import { IsString } from 'class-validator';

export class AssignRefereeDto {
  // TournamentUmpire id to assign as the referee for this match.
  @IsString()
  refereeId: string;
}
