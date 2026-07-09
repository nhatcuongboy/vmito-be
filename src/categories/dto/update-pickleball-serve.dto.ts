import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdatePickleballServeDto {
  // Which team is currently serving. 1 = side 1 (position 1), 2 = side 2.
  @IsIn([1, 2])
  servingSide: 1 | 2;

  // First (1) or second (2) server of the serving team.
  @IsIn([1, 2])
  serverNumber: 1 | 2;

  // Origin tag + monotonic sequence so the originating client can suppress its
  // own broadcast echo (mirrors UpdateMatchScoreDto).
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsNumber()
  seq?: number;
}
