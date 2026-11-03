import { IsString } from 'class-validator';

export class JoinSessionManagerDto {
  @IsString()
  code: string;
}
