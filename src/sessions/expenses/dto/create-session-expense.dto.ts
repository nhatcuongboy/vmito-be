import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionExpenseDto {
  @ApiProperty({ description: 'Expense name (e.g. Court fee, Shuttlecock)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Amount in VND', minimum: 0 })
  @IsInt()
  @Min(0)
  amount: number;
}
