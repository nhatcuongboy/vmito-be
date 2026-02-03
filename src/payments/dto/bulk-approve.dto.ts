import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkApproveDto {
  @ApiProperty({
    description: 'Array of payment IDs to approve',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  paymentIds: string[];

  @ApiPropertyOptional({ description: 'Host notes for all payments' })
  @IsString()
  @IsOptional()
  hostNotes?: string;
}
