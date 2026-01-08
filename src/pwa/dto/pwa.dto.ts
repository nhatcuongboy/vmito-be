import { IsString, IsOptional, IsObject } from 'class-validator';

export class SubscribeDto {
  @IsObject()
  subscription: {
    endpoint: string;
    keys?: {
      p256dh: string;
      auth: string;
    };
  };

  @IsOptional()
  @IsString()
  userId?: string;
}

export class UnsubscribeDto {
  @IsString()
  endpoint: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class SyncDto {
  @IsString()
  type: string;

  @IsOptional()
  data?: any;
}
