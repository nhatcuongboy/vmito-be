import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VenueDto {
  @ApiProperty({ example: 'clh1234567890abcdefghij' })
  id: string;

  @ApiProperty({ example: 'Sân Cầu Lông ABC' })
  name: string;

  @ApiProperty({ example: '123 Đường XYZ, Quận 1' })
  address: string;

  @ApiProperty({ example: 'Hồ Chí Minh' })
  city: string;

  @ApiProperty({ example: 'Quận 1' })
  district: string;

  @ApiProperty({ example: 10.762622 })
  lat: number;

  @ApiProperty({ example: 106.660172 })
  lng: number;
}

export class HostDto {
  @ApiProperty({ example: 'clh1234567890abcdefghij' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  image: string | null;
}

export class FeeConfigDto {
  @ApiProperty({ enum: ['FIXED', 'SPLIT_EVENLY'] })
  feeType: 'FIXED' | 'SPLIT_EVENLY';

  @ApiPropertyOptional({ example: 50000 })
  maleFee: number | null;

  @ApiPropertyOptional({ example: 40000 })
  femaleFee: number | null;
}

export class RecommendedSessionDto {
  @ApiProperty({ example: 'clh1234567890abcdefghij' })
  id: string;

  @ApiPropertyOptional({ example: 'keo-cau-long-abc-xyz123' })
  slug: string | null;

  @ApiProperty({ example: 'Kèo Cầu Lông Chiều Thứ 7' })
  name: string;

  @ApiPropertyOptional({ example: '2024-01-20T14:00:00.000Z' })
  startTime: string | null;

  @ApiPropertyOptional({ example: '2024-01-20T16:00:00.000Z' })
  endTime: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
  coverPhoto: string | null;

  @ApiPropertyOptional({ type: VenueDto })
  venue: VenueDto | null;

  @ApiProperty({ type: HostDto })
  host: HostDto;

  @ApiPropertyOptional({ type: FeeConfigDto })
  feeConfig: FeeConfigDto | null;

  @ApiProperty({ example: 8, description: 'Number of available slots' })
  availableSlots: number;

  @ApiProperty({ example: 16, description: 'Maximum number of slots' })
  maxSlots: number;

  @ApiProperty({
    example: [3, 4],
    description: 'Required stable skill level IDs',
    type: [Number],
  })
  requiredLevels: number[];

  @ApiProperty({
    example: 0.85,
    description: 'Relevance score (0-1)',
    minimum: 0,
    maximum: 1,
  })
  relevanceScore: number;

  @ApiProperty({
    example: ['same_venue', 'similar_level', 'nearby_time'],
    description: 'Match reasons',
    type: [String],
  })
  matchReasons: string[];

  @ApiPropertyOptional({
    example: 2.5,
    description: 'Distance in kilometers',
  })
  distance: number | null;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 12 })
  limit: number;

  @ApiProperty({ example: 45 })
  total: number;

  @ApiProperty({ example: 4 })
  totalPages: number;
}

export class RecommendationMetaDto {
  @ApiProperty({ example: 'clh1234567890abcdefghij' })
  currentSessionId: string;

  @ApiProperty({
    example: false,
    description: 'True if using popular sessions fallback',
  })
  isFallback: boolean;
}

export class RecommendationResponseDto {
  @ApiProperty({ type: [RecommendedSessionDto] })
  data: RecommendedSessionDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;

  @ApiProperty({ type: RecommendationMetaDto })
  meta: RecommendationMetaDto;
}
