import { ArrayNotEmpty, IsArray, IsEnum, IsOptional } from 'class-validator';
import { SessionPermission } from '@prisma/client';

export class CreateSessionManagerInviteDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(SessionPermission, { each: true })
  permissions?: SessionPermission[];
}
