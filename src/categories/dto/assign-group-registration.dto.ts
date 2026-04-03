import { IsString } from 'class-validator';

export class AssignGroupRegistrationDto {
  @IsString()
  categoryRegistrationId: string;
}
