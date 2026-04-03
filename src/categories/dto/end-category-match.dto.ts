import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MatchSetDto {
  @IsNumber()
  setNumber: number;

  @IsNumber()
  player1Score: number;

  @IsNumber()
  player2Score: number;

  @IsOptional()
  @IsNumber()
  player3Score?: number;

  @IsOptional()
  @IsNumber()
  player4Score?: number;
}

export class EndCategoryMatchDto {
  @IsString()
  score: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchSetDto)
  sets?: MatchSetDto[];

  @IsOptional()
  @IsString()
  winnerId?: string;

  @IsOptional()
  @IsBoolean()
  isDraw?: boolean;

  @IsOptional()
  @IsNumber()
  player1Score?: number;

  @IsOptional()
  @IsNumber()
  player2Score?: number;

  @IsOptional()
  @IsNumber()
  player3Score?: number;

  @IsOptional()
  @IsNumber()
  player4Score?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
