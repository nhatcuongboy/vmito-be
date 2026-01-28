import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitPaymentDto {
  @ApiProperty({ enum: PaymentMethod, description: 'Payment method' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'URL of proof image' })
  @IsUrl()
  @IsOptional()
  proofImageUrl?: string;

  @ApiPropertyOptional({ description: 'Notes about the payment' })
  @IsString()
  @IsOptional()
  proofNotes?: string;
}
