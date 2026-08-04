import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export enum HostReportGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class HostReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start of the report range (ISO date). Defaults to 30 days ago.',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the report range (ISO date). Defaults to now.',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    enum: HostReportGranularity,
    description: 'Bucket size for the income/expense series. Defaults to month.',
  })
  @IsOptional()
  @IsEnum(HostReportGranularity)
  granularity?: HostReportGranularity;
}
