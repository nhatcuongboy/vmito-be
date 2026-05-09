import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateMatchAssignmentDto {
  @IsString()
  courtId!: string;

  @IsISO8601()
  startTime!: string;

  @IsInt()
  @Min(5)
  @Max(180)
  duration!: number;
}

export class ClearMatchAssignmentDto {
  @IsOptional()
  @IsString()
  courtId?: string | null = null;

  @IsOptional()
  @IsISO8601()
  startTime?: string | null = null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(180)
  duration?: number | null = null;
}
