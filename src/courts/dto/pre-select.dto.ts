import { IsArray, IsString, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PlayerPosition {
  @IsString()
  playerId: string;

  @IsNumber()
  position: number;
}

export class PreSelectDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerPosition)
  playersWithPosition: PlayerPosition[];
}
