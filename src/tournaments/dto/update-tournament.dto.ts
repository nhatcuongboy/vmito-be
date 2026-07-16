import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  IsBoolean,
  IsEmail,
  IsArray,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['PREPARING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsIn(['NEXT_AVAILABLE', 'ASSIGNED'])
  scheduleType?: string;

  @IsOptional()
  @IsIn(['BADMINTON', 'PICKLEBALL'])
  sportType?: string;

  @IsOptional()
  @IsString()
  venueId?: string | null;

  @IsOptional()
  @IsString()
  coverPhoto?: string;

  @IsOptional()
  @IsString()
  coverPhotoPublicId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  youtubeVideoUrls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsEmail()
  @MaxLength(150)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string | null;
}
