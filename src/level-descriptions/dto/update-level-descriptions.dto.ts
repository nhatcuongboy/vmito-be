import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LevelDescriptionInputDto {
  @IsInt()
  @Min(1)
  @Max(8)
  level: number;

  @IsString()
  description: string;
}

export class UpdateLevelDescriptionsDto {
  @IsArray()
  @ArrayMinSize(8)
  @ValidateNested({ each: true })
  @Type(() => LevelDescriptionInputDto)
  descriptions: LevelDescriptionInputDto[];
}
