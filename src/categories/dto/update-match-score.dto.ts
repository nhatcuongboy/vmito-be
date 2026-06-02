import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateMatchScoreDto {
  // 1 = side 1 (position 1), 2 = side 2 (position 2)
  @IsIn([1, 2])
  side: 1 | 2;

  // +1 to add a point, -1 to correct a misclick on that side
  @IsIn([1, -1])
  delta: 1 | -1;

  // Origin tag + monotonic sequence so the originating client can suppress its
  // own broadcast echo (prevents optimistic double-counting on the FE).
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsNumber()
  seq?: number;
}
