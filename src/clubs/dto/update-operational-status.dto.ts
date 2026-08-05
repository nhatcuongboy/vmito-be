import { IsEnum } from 'class-validator';
import { ClubOperationalStatus } from '@prisma/client';

export class UpdateOperationalStatusDto {
  @IsEnum(ClubOperationalStatus)
  operationalStatus: ClubOperationalStatus;
}
