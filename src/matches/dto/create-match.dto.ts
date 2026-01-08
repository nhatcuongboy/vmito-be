import { IsString, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  courtId: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  playerIds: string[];
}
