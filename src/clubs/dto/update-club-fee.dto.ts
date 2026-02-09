import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateClubFeeDto } from './create-club-fee.dto';

export class UpdateClubFeeDto extends PartialType(
  OmitType(CreateClubFeeDto, ['month', 'year'] as const)
) {}
