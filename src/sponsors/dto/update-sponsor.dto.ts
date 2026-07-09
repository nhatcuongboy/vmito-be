import { PartialType } from '@nestjs/swagger';
import { CreateSponsorDto } from './create-sponsor.dto';

export class UpdateSponsorDto extends PartialType(CreateSponsorDto) {}
