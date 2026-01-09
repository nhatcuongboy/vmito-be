import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { Gender, Level, PlayerStatus } from '@prisma/client';

export class UpdatePlayerInSessionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: Gender | null;

  @IsOptional()
  @IsIn(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL'])
  level?: Level | null;

  @IsOptional()
  @IsString()
  levelDescription?: string;

  @IsOptional()
  @IsString()
  desire?: string;

  @IsOptional()
  @IsIn(['WAITING', 'PLAYING', 'FINISHED', 'REMOVED'])
  status?: PlayerStatus;

  @IsOptional()
  @IsBoolean()
  preFilledByHost?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmedByPlayer?: boolean;

  @IsOptional()
  @IsBoolean()
  requireConfirmInfo?: boolean;
}
