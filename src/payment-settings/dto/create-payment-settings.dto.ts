import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentSettingsDto {
  @ApiPropertyOptional({ description: 'Bank name (e.g., Vietcombank)' })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Bank account number' })
  @IsString()
  @IsOptional()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ description: 'Account holder name' })
  @IsString()
  @IsOptional()
  accountHolderName?: string;

  @ApiPropertyOptional({ description: 'QR code image URL' })
  @IsUrl()
  @IsOptional()
  qrCodeUrl?: string;

  @ApiPropertyOptional({ description: 'Set as default payment settings' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
