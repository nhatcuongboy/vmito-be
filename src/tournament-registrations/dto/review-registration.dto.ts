import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TournamentRegistrationStatus } from '@prisma/client';

export class ReviewRegistrationDto {
  /** Organizer note shown to the requester (e.g. rejection reason). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  response?: string;
}

export class ListRegistrationRequestsDto {
  @IsOptional()
  @IsEnum(TournamentRegistrationStatus)
  status?: TournamentRegistrationStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
