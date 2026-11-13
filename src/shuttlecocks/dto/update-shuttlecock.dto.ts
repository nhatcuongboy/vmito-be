import { PartialType } from '@nestjs/swagger';
import { CreateShuttlecockDto } from './create-shuttlecock.dto';

export class UpdateShuttlecockDto extends PartialType(CreateShuttlecockDto) {}
