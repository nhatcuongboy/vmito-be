import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export enum DashboardGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Start of the trend range (ISO date). Defaults to 30 days ago.',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the trend range (ISO date). Defaults to now.',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    enum: DashboardGranularity,
    description: 'Bucket size for the trend series. Defaults to day.',
  })
  @IsOptional()
  @IsEnum(DashboardGranularity)
  granularity?: DashboardGranularity;
}
