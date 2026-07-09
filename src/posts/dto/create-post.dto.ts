import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';

export class CreatePostImageDto {
  @IsUrl()
  url: string;

  @IsString()
  publicId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePostDto {
  @IsString()
  content: string = '';

  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @IsOptional()
  @IsObject()
  location?: {
    name: string;
    lat: number;
    lng: number;
    address?: string;
  };

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePostImageDto)
  images?: CreatePostImageDto[];
}
