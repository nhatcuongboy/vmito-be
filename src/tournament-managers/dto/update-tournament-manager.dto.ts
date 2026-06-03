import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { TournamentPermission } from '@prisma/client';

export class UpdateTournamentManagerDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TournamentPermission, { each: true })
  permissions: TournamentPermission[];
}
