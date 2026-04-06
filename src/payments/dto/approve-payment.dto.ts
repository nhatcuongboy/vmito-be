import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class ApprovePaymentDto {
  @ApiPropertyOptional({ description: 'Host notes' })
  @IsString()
  @IsOptional()
  hostNotes?: string;

  @ApiPropertyOptional({ description: 'Override amount in VND', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Payment method used by the player',
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;
}

export class RejectPaymentDto {
  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsString()
  @IsOptional()
  hostNotes?: string;
}
