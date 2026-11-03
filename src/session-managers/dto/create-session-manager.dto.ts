import { ArrayNotEmpty, IsArray, IsEnum, IsString } from 'class-validator';
import { SessionPermission } from '@prisma/client';

export class CreateSessionManagerDto {
  @IsString()
  userId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(SessionPermission, { each: true })
  permissions: SessionPermission[];
}
