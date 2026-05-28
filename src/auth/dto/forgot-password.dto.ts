import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsIn(['vi', 'en', 'cn'])
  locale?: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false, require_protocol: true })
  redirectUrl: string;
}
