import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  VenueRentalDepositMode,
  VenueRentalPaymentMethod,
  VenueRentalTransactionPurpose,
} from '@prisma/client';

export class UpdateRentalPaymentSettingsDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  bankName?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  bankAccountNumber?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  bankAccountName?: string;

  @ValidateIf((_object, value) => value !== '')
  @IsUrl({ require_tld: false })
  @IsOptional()
  qrUrl?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  qrPublicId?: string;

  @IsEnum(VenueRentalDepositMode)
  @IsOptional()
  depositMode?: VenueRentalDepositMode;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  depositValue?: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(1440)
  @IsOptional()
  depositDeadlineMinutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(720)
  @IsOptional()
  balanceDueHours?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8760)
  @IsOptional()
  refundCutoffHours?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  refundBeforePercent?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  refundAfterPercent?: number;
}

export class SubmitRentalPaymentDto {
  @IsEnum(VenueRentalTransactionPurpose)
  purpose!: VenueRentalTransactionPurpose;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsUrl({ require_tld: false })
  proofUrl!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  proofPublicId?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class RecordRentalCashPaymentDto {
  @IsEnum(VenueRentalTransactionPurpose)
  purpose!: VenueRentalTransactionPurpose;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class RejectRentalPaymentDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class CompleteRentalRefundDto {
  @IsEnum(VenueRentalPaymentMethod)
  method!: VenueRentalPaymentMethod;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  proofUrl?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  proofPublicId?: string;
}
