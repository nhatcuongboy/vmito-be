import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AddMatchToQueueDto {
  @IsString()
  matchId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  queueOrder?: number;
}

export class ReorderQueueDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  matchIds!: string[];
}
