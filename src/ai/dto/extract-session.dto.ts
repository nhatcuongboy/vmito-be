import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Language } from '../../common/constants/language.enum';

export class ExtractSessionRequestDto {
  @IsString()
  @IsNotEmpty()
  articleContent: string;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;
}

export interface ExtractedVenue {
  name?: string;
  address?: string;
  district?: string;
  city?: string;
}

export interface ExtractedSessionDto {
  name?: string;
  description?: string;
  hostName?: string;
  hostPhone?: string;
  startTime?: string; // ISO date string
  endTime?: string; // ISO date string
  maxPlayersPerCourt?: number;
  // Valid values: 'Y', 'TB-', 'TB', 'TB+', 'K-', 'K', 'BC', 'Pro'
  requiredLevels?: string[];
  venue?: ExtractedVenue;
  venueId?: string; // Matched venue ID from database
  numberOfCourts?: number;
  courtNames?: string[];
  shuttlecock?: string;
  feeConfig?: {
    feeType: 'FIXED' | 'SPLIT_EVENLY';
    maleFee?: number;
    femaleFee?: number;
    notes?: string;
  };
}

export class ChatMessageDto {
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class AiChatRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsString()
  @IsOptional()
  pageContext?: string;
}
