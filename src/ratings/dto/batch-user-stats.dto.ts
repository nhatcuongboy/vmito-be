import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BatchUserStatsDto {
  @ApiProperty({
    description: 'Array of user IDs to fetch rating stats for',
    example: ['user1', 'user2', 'user3'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  userIds: string[];
}
