import { IsEnum, IsOptional } from 'class-validator';
import { FeedbackType, FeedbackStatus } from '@prisma/client';

export class QueryFeedbackDto {
  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;

  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;
}
