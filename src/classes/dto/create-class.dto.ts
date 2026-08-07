import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClassTuitionPeriod, SportType } from '@prisma/client';

export class ClassScheduleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:mm format' })
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CustomClassLocationDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeId?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

export class ClassSocialLinksDto {
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'facebook must be a valid URL' }
  )
  facebook?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'zalo must be a valid URL' }
  )
  zalo?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'tiktok must be a valid URL' }
  )
  tiktok?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'youtube must be a valid URL' }
  )
  youtube?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'website must be a valid URL' }
  )
  website?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'other must be a valid URL' }
  )
  other?: string;
}

export class CreateClassDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsEnum(SportType)
  sportType: SportType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsString()
  @MaxLength(30)
  contactPhone: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  zaloUrl?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClassSocialLinksDto)
  socialLinks?: ClassSocialLinksDto;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  requiredLevels?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsEnum(ClassTuitionPeriod)
  tuitionPeriod?: ClassTuitionPeriod;

  @IsOptional()
  @IsInt()
  @Min(0)
  tuitionAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tuitionNotes?: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomClassLocationDto)
  customLocation?: CustomClassLocationDto;

  @IsOptional()
  @IsString()
  coverPhoto?: string;

  @IsOptional()
  @IsString()
  coverPhotoPublicId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagePublicIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassScheduleDto)
  schedules: ClassScheduleDto[];
}
