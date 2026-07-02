import {
  IsString,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClubJoinPolicy } from '@prisma/client';

export class ClubScheduleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number; // 0=CN, 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:mm format' })
  endTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class CreateClubDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  hostName?: string; // Provisional host name for admin-created clubs

  @IsOptional()
  @IsString()
  hostUserId?: string; // Admin can assign a specific user as the initial ADMIN member

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsEnum(ClubJoinPolicy)
  joinPolicy?: ClubJoinPolicy;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxMembers?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  defaultVenueId?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagePublicIds?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  requiredLevels?: number[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ClubScheduleDto)
  schedules?: ClubScheduleDto[];
}
