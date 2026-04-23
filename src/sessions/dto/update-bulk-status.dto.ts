import { IsEnum, IsArray, IsString } from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class UpdateBulkStatusDto {
  @IsArray()
  @IsString({ each: true })
  sessionIds: string[];

  @IsEnum(SessionStatus)
  status: SessionStatus;
}
