import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleOneTapDto {
  @ApiProperty({
    description: 'Google ID token (JWT) from One Tap credential callback',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
