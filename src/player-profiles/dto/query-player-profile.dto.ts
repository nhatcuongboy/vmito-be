import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PlayerProfileStatus } from '@prisma/client';

export class QueryPlayerProfileDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsEnum(PlayerProfileStatus)
  status?: PlayerProfileStatus;
}
