import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CloneSessionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;
}
