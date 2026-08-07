import { IsEnum } from 'class-validator';
import { ClassStatus } from '@prisma/client';

export class UpdateClassStatusDto {
  @IsEnum(ClassStatus)
  status: ClassStatus;
}
