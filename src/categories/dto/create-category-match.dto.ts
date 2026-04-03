import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MatchParticipantDto {
  @IsString()
  categoryRegistrationId: string;

  @IsNumber()
  position: number;
}

export class CreateCategoryMatchDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsString()
  round: string;

  @IsNumber()
  matchNumber: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchParticipantDto)
  participants: MatchParticipantDto[];

  @IsOptional()
  @IsString()
  courtId?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsIn(['BEST_OF_1', 'BEST_OF_3'])
  matchFormat?: string;
}
