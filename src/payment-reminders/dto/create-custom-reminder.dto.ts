import { IsInt, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomReminderDto {
  @ApiProperty({ description: 'User id of the recipient to remind' })
  @IsString()
  recipientUserId: string;

  @ApiProperty({ description: 'Amount in VND', minimum: 1 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Note explaining what the amount is for', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  note: string;
}
