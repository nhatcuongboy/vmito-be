import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateGroupFeeDto } from './create-group-fee.dto';

export class UpdateGroupFeeDto extends PartialType(
  OmitType(CreateGroupFeeDto, ['month', 'year'] as const)
) {}
