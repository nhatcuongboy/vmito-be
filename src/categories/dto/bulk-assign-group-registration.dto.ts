import { IsArray, IsString } from 'class-validator';

export class BulkAssignGroupRegistrationDto {
  @IsArray()
  @IsString({ each: true })
  categoryRegistrationIds: string[];
}
