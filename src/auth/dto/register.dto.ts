import {
  IsEmail,
  IsString,
  MinLength,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
  })
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'Phone must be 10 digits' })
  phone?: string;

  @IsOptional()
  @IsEnum(Gender, {
    message: 'Gender must be MALE, FEMALE, OTHER, or PREFER_NOT_TO_SAY',
  })
  gender?: Gender;
}
