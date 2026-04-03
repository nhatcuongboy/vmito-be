import { IsOptional, IsBoolean, IsIn } from 'class-validator';

export class AutoAssignDto {
  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;

  @IsOptional()
  @IsIn(['round-robin', 'sequential', 'balanced'])
  strategy?: string;
}
