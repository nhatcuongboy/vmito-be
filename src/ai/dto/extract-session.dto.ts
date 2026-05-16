import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Language } from '../../common/constants/language.enum';

export class ExtractSessionRequestDto {
  @IsString()
  @IsNotEmpty()
  articleContent!: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}

export interface ExtractedVenue {
  placeId?: string;
  name?: string;
  address?: string;
  district?: string;
  city?: string;
  newAddress?: string;
  newDistrict?: string;
  newCity?: string;
}

export interface ExtractedCourt {
  courtNumber: number;
  courtName?: string;
  direction?: 'HORIZONTAL' | 'VERTICAL';
}

export interface ExtractedSessionDto {
  name?: string;
  description?: string;
  notes?: string;
  location?: string;
  hostName?: string;
  hostPhone?: string;
  startTime?: string; // ISO date string
  endTime?: string; // ISO date string
  sessionDuration?: number;
  maxPlayersPerCourt?: number;
  // Numeric level IDs (1-8) matching LEVELS constant
  requiredLevels?: number[];
  venue?: ExtractedVenue;
  venueId?: string; // Matched venue ID from database
  numberOfCourts?: number;
  courts?: ExtractedCourt[];
  courtNames?: string[];
  shuttlecock?: string;
  defaultMatchType?: 'SINGLES' | 'DOUBLES';
  feeConfig?: {
    feeType: 'FIXED' | 'SPLIT_EVENLY';
    maleFee?: number;
    femaleFee?: number;
    notes?: string;
  };
}

export class ChatMessageDto {
  @IsEnum(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class AiChatRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsString()
  @IsOptional()
  pageContext?: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}
