import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectReminderDto {
  @ApiPropertyOptional({ description: 'Reason for rejecting the proof', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  hostNotes?: string;
}
