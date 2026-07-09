import { ArrayNotEmpty, IsArray, IsEnum, IsString } from 'class-validator';
import { TournamentPermission } from '@prisma/client';

export class CreateTournamentManagerDto {
  @IsString()
  userId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TournamentPermission, { each: true })
  permissions: TournamentPermission[];
}
