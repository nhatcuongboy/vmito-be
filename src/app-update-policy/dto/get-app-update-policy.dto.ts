import { IsIn } from 'class-validator';

export class GetAppUpdatePolicyDto {
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}
