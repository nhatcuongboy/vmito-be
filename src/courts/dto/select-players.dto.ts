import {
  IsOptional,
  IsArray,
  IsString,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PlayerWithPosition {
  @IsString()
  playerId: string;

  @IsNumber()
  position: number;
}

export class SelectPlayersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playerIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerWithPosition)
  players?: PlayerWithPosition[];
}
