import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaymentReminderStatus } from '@prisma/client';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class QueryRemindersDto {
  @ApiProperty({ enum: ['creator', 'recipient'], description: 'Which side of the reminder to list' })
  @IsIn(['creator', 'recipient'])
  role: 'creator' | 'recipient';

  @ApiPropertyOptional({ enum: PaymentReminderStatus })
  @IsEnum(PaymentReminderStatus)
  @IsOptional()
  status?: PaymentReminderStatus;
}
