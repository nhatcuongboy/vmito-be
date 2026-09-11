import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateWelcomePopupDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  // ctaUrl may be an internal path (e.g. /tournaments/abc) or an external
  // URL, so it's intentionally not validated with @IsUrl.
  @ValidateIf((o: CreateWelcomePopupDto) => !!o.ctaUrl)
  @IsString()
  @MaxLength(50)
  ctaLabel?: string;

  @ValidateIf((o: CreateWelcomePopupDto) => !!o.ctaLabel)
  @IsString()
  ctaUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
