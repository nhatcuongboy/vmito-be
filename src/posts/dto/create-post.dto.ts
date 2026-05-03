import { IsString, IsOptional, IsUrl, IsObject } from 'class-validator';

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
}
