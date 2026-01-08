import { IsOptional, IsString, IsIn } from 'class-validator';
import { CourtDirection } from '@prisma/client';

export class UpdateCourtDto {
  @IsOptional()
  @IsString()
  courtName?: string;

  @IsOptional()
  @IsIn(['HORIZONTAL', 'VERTICAL'])
  direction?: CourtDirection;
}
