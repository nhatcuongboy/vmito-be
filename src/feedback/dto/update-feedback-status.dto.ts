import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FeedbackStatus } from '@prisma/client';

export class UpdateFeedbackStatusDto {
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
