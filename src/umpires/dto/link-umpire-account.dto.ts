import { IsEmail } from 'class-validator';

export class LinkUmpireAccountDto {
  @IsEmail()
  email: string;
}
