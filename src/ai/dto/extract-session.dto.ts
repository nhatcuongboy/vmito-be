import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SportType } from '@prisma/client';
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
  // Classification gate: true only when the post is actively recruiting
  // other players for a casual/pickup session (tuyển vãng lai). Class ads,
  // court-rental/availability listings, equipment sales, and tournament
  // announcements must come back false so the crawler skips them.
  isRecruitmentPost?: boolean;
  // Short reason from the model when isRecruitmentPost is false — logged by
  // the crawler ingest so false negatives can be spotted and the prompt tuned.
  nonRecruitmentReason?: string;
  name?: string;
  // Sport detected from the post; falls back to the matched venue then BADMINTON.
  sportType?: SportType;
  description?: string;
  notes?: string;
  location?: string;
  hostName?: string;
  hostPhone?: string;
  startTime?: string; // ISO date string
  endTime?: string; // ISO date string
  sessionDuration?: number;
  maxPlayersPerCourt?: number;
  // Numeric level IDs matching LEVELS constant
  requiredLevels?: number[];
  // Venue snapshot. When venueId is set this is the canonical DB record; when
  // venueId is absent it is the unverified AI-extracted candidate that callers
  // should persist as a custom location instead of linking to a Venue.
  venue?: ExtractedVenue;
  // Set ONLY by the backend after findMatchingVenue() confirms a DB match.
  // Never populated from model output — the AI schema has no venueId field.
  venueId?: string;
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
