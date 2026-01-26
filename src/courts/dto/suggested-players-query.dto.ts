import { IsEnum, IsOptional, IsNumberString } from 'class-validator';
import { Language } from '../../common/constants/language.enum';

export class SuggestedPlayersQueryDto {
  @IsNumberString()
  @IsOptional()
  topCount?: string;

  @IsOptional()
  useAi?: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}
