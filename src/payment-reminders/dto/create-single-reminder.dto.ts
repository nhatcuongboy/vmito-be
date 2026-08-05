import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateSingleReminderDto {
  @ApiProperty({ description: 'Payment record id to remind about' })
  @IsString()
  paymentId: string;

  @ApiPropertyOptional({ description: 'Optional note to include', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
