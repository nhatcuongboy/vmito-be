import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeWebViewSessionDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
