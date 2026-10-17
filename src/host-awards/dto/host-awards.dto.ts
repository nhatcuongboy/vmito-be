import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MonthKeyParamDto {
  /** `2026-10` (Vietnam time). */
  @Matches(MONTH_KEY)
  monthKey!: string;
}

export class HostEntryParamDto extends MonthKeyParamDto {
  @IsString()
  hostId!: string;
}

export class SetHostExclusionDto {
  @IsBoolean()
  excluded!: boolean;

  /** Required when excluding; shown in the audit log. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateHostAwardSanctionDto {
  @IsString()
  hostId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /** Omit for a permanent ban. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}
