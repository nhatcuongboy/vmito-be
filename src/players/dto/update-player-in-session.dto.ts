import {
  IsOptional,
  IsString,
  IsBoolean,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Gender, Level, PlayerStatus } from '@prisma/client';

export class UpdatePlayerInSessionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf((o: UpdatePlayerInSessionDto) => o.gender !== null)
  @IsIn(['MALE', 'FEMALE'])
  gender?: Gender | null;

  @IsOptional()
  @ValidateIf((o: UpdatePlayerInSessionDto) => o.level !== null)
  @IsIn(['Y', 'Y_PLUS', 'TBY', 'TB_MINUS', 'TB', 'TB_PLUS', 'Y_MINUS', 'K'])
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

  // ============ Fields to ignore (sent by FE but not used) ============
  // These fields are allowed in the request body but will be ignored
  @IsOptional()
  id?: string;

  @IsOptional()
  sessionId?: string;

  @IsOptional()
  userId?: string;

  @IsOptional()
  playerNumber?: number;

  @IsOptional()
  currentWaitTime?: number;

  @IsOptional()
  totalWaitTime?: number;

  @IsOptional()
  matchesPlayed?: number;

  @IsOptional()
  currentCourtId?: string;

  @IsOptional()
  courtPosition?: number;

  @IsOptional()
  joinCode?: string;

  @IsOptional()
  currentCourt?: unknown;

  @IsOptional()
  phone?: string;

  @IsOptional()
  isJoined?: boolean;

  @IsOptional()
  isGuest?: boolean;

  @IsOptional()
  joinedAt?: Date;

  @IsOptional()
  createdAt?: Date;

  @IsOptional()
  updatedAt?: Date;
}
