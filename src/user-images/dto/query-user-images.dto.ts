import { IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ImageCategory } from '@prisma/client';

export class QueryUserImagesDto {
  @IsEnum(ImageCategory)
  @IsOptional()
  category?: ImageCategory;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;
}
