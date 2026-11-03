import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { SessionPermission } from '@prisma/client';

export class UpdateSessionManagerDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(SessionPermission, { each: true })
  permissions: SessionPermission[];
}
