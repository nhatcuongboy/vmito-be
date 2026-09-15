import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class BroadcastNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  link?: string;
}

