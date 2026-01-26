import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
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
  requiredLevels?: number[];
  venue?: ExtractedVenue;
  numberOfCourts?: number;
}
