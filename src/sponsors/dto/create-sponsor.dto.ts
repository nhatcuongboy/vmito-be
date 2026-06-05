import { IsString, IsOptional, IsInt, IsUrl, MaxLength } from 'class-validator';

export class CreateSponsorDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  logoPublicId?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'website must be a valid URL' })
  website?: string;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
