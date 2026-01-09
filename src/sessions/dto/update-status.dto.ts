import { IsEnum } from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(SessionStatus)
  status: SessionStatus;
}
