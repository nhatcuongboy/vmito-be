import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAggregateReminderDto {
  @ApiProperty({ description: 'User id of the recipient to remind' })
  @IsString()
  recipientUserId: string;
}
