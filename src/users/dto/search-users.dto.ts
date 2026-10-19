import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Query for the player directory search. `search` is required so the
 * endpoint can never be used to page through every account.
 */
export class SearchUsersQueryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  search: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
