import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetPlayerStatusDto {
  @ApiProperty({
    description:
      'Guest token in format: guest_{sessionId}_{playerNumber}_{timestamp}',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
