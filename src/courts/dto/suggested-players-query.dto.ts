import { IsEnum, IsOptional, IsNumberString } from 'class-validator';
import { Language } from '../../common/constants/language.enum';
import { MatchType } from '@prisma/client';

export class SuggestedPlayersQueryDto {
  @IsNumberString()
  @IsOptional()
  topCount?: string;

  @IsOptional()
  useAi?: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;

  @IsEnum(MatchType)
  @IsOptional()
  matchType?: MatchType;
}
