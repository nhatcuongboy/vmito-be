import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitRegistrationDto {
  @IsString()
  categoryId: string;

  /** Teammates with a Vmito account — they earn points once approved. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  partnerUserIds?: string[];

  /** Teammates without an account (entered by name, no points). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  guestPartnerNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
