import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AcceptChatTermsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  termsVersion: string;
}

export class ChatContactsQueryDto {
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

export class CreateChatRequestDto {
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;

  @IsUUID()
  idempotencyKey: string;
}

export class DirectChatDto {
  @IsString()
  @IsNotEmpty()
  targetUserId: string;
}

export class ChatBlockDto extends DirectChatDto {}
