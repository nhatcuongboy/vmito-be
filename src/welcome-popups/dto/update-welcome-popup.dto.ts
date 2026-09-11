import { PartialType } from '@nestjs/swagger';
import { CreateWelcomePopupDto } from './create-welcome-popup.dto';

export class UpdateWelcomePopupDto extends PartialType(CreateWelcomePopupDto) {}
