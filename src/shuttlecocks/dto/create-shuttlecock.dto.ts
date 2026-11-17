import {
  ShuttlecockCorkType,
  ShuttlecockFeatherType,
  ShuttlecockSuitability,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PriceRangeDto {
  @IsInt()
  @Min(0)
  minTube: number;

  @IsInt()
  @Min(0)
  maxTube: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minCarton?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxCarton?: number;
}

export class RatingDto {
  @IsNumber()
  overall: number;

  @IsNumber()
  flightStability: number;

  @IsNumber()
  durability: number;

  @IsNumber()
  feelAndImpact: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  totalReviews?: number;
}

export class AffiliateStoreDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  storeName: string;

  @IsString()
  url: string;

  @IsNumber()
  price: number;

  @IsNumber()
  @IsOptional()
  originalPrice?: number;

  @IsString()
  unit: 'TUBE' | 'CARTON';

  @IsBoolean()
  isOfficialMall: boolean;

  @IsString()
  @IsOptional()
  promoBadge?: string;
}

export class CreateShuttlecockDto {
  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsNotEmpty()
  brand: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  vietnameseName: string;

  @IsString()
  @IsNotEmpty()
  featuredImage: string;

  @IsArray()
  @IsOptional()
  galleryImages?: string[];

  @IsEnum(ShuttlecockFeatherType)
  featherType: ShuttlecockFeatherType;

  @IsInt()
  @Min(1)
  @IsOptional()
  featherCount?: number = 16;

  @IsEnum(ShuttlecockCorkType)
  corkType: ShuttlecockCorkType;

  @IsArray()
  @IsInt({ each: true })
  speedOptions: number[];

  @IsBoolean()
  @IsOptional()
  bwfApproved?: boolean = false;

  @IsArray()
  @IsEnum(ShuttlecockSuitability, { each: true })
  suitability: ShuttlecockSuitability[];

  @ValidateNested()
  @Type(() => PriceRangeDto)
  priceRange: PriceRangeDto;

  @ValidateNested()
  @Type(() => RatingDto)
  @IsOptional()
  rating?: RatingDto;

  @IsArray()
  @IsOptional()
  pros?: string[];

  @IsArray()
  @IsOptional()
  cons?: string[];

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsOptional()
  searchAliases?: string[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AffiliateStoreDto)
  affiliateStores?: AffiliateStoreDto[];
}
