import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class LevelDescriptionInputDto {
  @IsInt()
  @Min(1)
  level: number;

  @IsString()
  description: string;
}

export class UpdateLevelDescriptionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LevelDescriptionInputDto)
  descriptions: LevelDescriptionInputDto[];
}
