import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SportType } from '@prisma/client';
import { Language } from '../../common/constants/language.enum';

export const MIN_LEVEL_DESCRIPTION_LENGTH = 20;
export const MAX_LEVEL_DESCRIPTION_LENGTH = 1000;

export class SuggestLevelRequestDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(MIN_LEVEL_DESCRIPTION_LENGTH)
  @MaxLength(MAX_LEVEL_DESCRIPTION_LENGTH)
  description!: string;

  /** The sport being assessed. Levels are one shared ladder today. */
  @IsEnum(SportType)
  @IsOptional()
  sportType?: SportType;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}

export type LevelSuggestionConfidence = 'low' | 'medium' | 'high';

export interface SuggestLevelResponseDto {
  /** Stable level id, or null when the text does not describe enough. */
  level: number | null;
  lowestLevel: number | null;
  highestLevel: number | null;
  confidence: LevelSuggestionConfidence;
  /** Short reasons in the requested language, quoting what the player said. */
  reasons: string[];
  /** What to add when `level` is null, in the requested language. */
  followUp: string | null;
}
