import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  ValidateIf,
  IsNumber,
  Min,
} from 'class-validator';
import { Gender, PlayerStatus } from '@prisma/client';

export class UpdatePlayerInSessionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf((o: UpdatePlayerInSessionDto) => o.gender !== null)
  @IsEnum(Gender)
  gender?: Gender | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  level?: number | null;

  @IsOptional()
  @IsString()
  levelDescription?: string;

  @IsOptional()
  @IsString()
  desire?: string;

  @IsOptional()
  @IsEnum(PlayerStatus)
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

  @IsOptional()
  @IsBoolean()
  isClubMember?: boolean;

  @IsOptional()
  @IsString()
  clubId?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdatePlayerInSessionDto) => o.customFee !== null)
  @IsNumber()
  @Min(0)
  customFee?: number | null;

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
  @IsString()
  registrationStatus?: string;

  @IsOptional()
  currentCourt?: unknown;

  @IsOptional()
  user?: unknown;

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

  @IsOptional()
  club?: unknown;
}
