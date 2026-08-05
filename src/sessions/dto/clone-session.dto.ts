import { IsDateString } from 'class-validator';

export class CloneSessionDto {
  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;
}
