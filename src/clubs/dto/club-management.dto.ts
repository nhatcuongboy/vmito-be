import { IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsEnum(MemberRole)
  role: MemberRole;
}

export class JoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class RejectJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  response?: string;
}

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  pinnedUntil?: Date;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  pinnedUntil?: Date | null;
}
