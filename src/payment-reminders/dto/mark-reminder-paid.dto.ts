import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarkReminderPaidDto {
  @ApiProperty({ enum: PaymentMethod, description: 'Payment method' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'URL of proof image' })
  @IsUrl()
  @IsOptional()
  proofImageUrl?: string;

  @ApiPropertyOptional({ description: 'Cloudinary public id of proof image' })
  @IsString()
  @IsOptional()
  proofImagePublicId?: string;

  @ApiPropertyOptional({ description: 'Notes about the payment' })
  @IsString()
  @IsOptional()
  proofNotes?: string;
}
