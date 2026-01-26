import { IsEnum, IsOptional } from 'class-validator';
import { Language } from '../../common/constants/language.enum';

export class SuggestTasksDto {
  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}
