import {
  IsString,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ClubJoinPolicy } from '@prisma/client';

export class CreateGroupDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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
}
