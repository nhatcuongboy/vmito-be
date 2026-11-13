import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PriceRangeDto {
  @IsNumber()
  minTube: number;

  @IsNumber()
  maxTube: number;

  @IsNumber()
  @IsOptional()
  minCarton?: number;

  @IsNumber()
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

  @IsNumber()
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

  @IsString()
  featherType: 'DUCK' | 'GOOSE' | 'SYNTHETIC' | 'HYBRID_3IN1';

  @IsNumber()
  @IsOptional()
  featherCount?: number = 16;

  @IsString()
  corkType: 'NATURAL' | 'COMPOSITE' | 'SANDWICH' | 'FOAM';

  @IsArray()
  speedOptions: number[];

  @IsBoolean()
  @IsOptional()
  bwfApproved?: boolean = false;

  @IsArray()
  suitability: Array<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'TOURNAMENT'>;

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
