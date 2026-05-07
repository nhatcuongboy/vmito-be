import { PartialType } from '@nestjs/swagger';
import { CreateSessionExpenseDto } from './create-session-expense.dto';

export class UpdateSessionExpenseDto extends PartialType(
  CreateSessionExpenseDto
) {}
