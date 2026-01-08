import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  adminKey: string;
}


