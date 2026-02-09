import { IsArray, IsString, IsEnum, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchUpdateStatusDto {
  @ApiProperty({ description: 'Array of player IDs to update' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  playerIds: string[];

  @ApiProperty({
    description: 'New registration status',
    enum: ['APPROVED', 'REJECTED'],
  })
  @IsEnum({ APPROVED: 'APPROVED', REJECTED: 'REJECTED' })
  status: 'APPROVED' | 'REJECTED';
}
