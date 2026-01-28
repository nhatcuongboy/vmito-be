import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovePaymentDto {
  @ApiPropertyOptional({ description: 'Host notes' })
  @IsString()
  @IsOptional()
  hostNotes?: string;
}

export class RejectPaymentDto {
  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsString()
  @IsOptional()
  hostNotes?: string;
}
