import { DiscoveryFilterTab } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDiscoveryFilterPresetDto {
  @IsEnum(DiscoveryFilterTab)
  tab: DiscoveryFilterTab;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsObject()
  config: Record<string, unknown>;
}

export class UpdateDiscoveryFilterPresetDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
