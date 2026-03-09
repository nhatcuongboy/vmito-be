import { Injectable } from '@nestjs/common';
import { Prisma, VenueStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { SearchVenueDto } from './dto/search-venue.dto';
import { removeVietnameseTones } from '../common/utils/string.utils';

@Injectable()
export class VenuesService {
  constructor(private prisma: PrismaService) {}

  async searchVenues(filters: SearchVenueDto) {
    const {
      keyword,
      city,
      district,
      lat,
      lng,
      radius,
      status,
      isVerified,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 12,
    } = filters;

    const skip = (page - 1) * limit;
    const andConditions: Prisma.VenueWhereInput[] = [];

    // Keyword search (name OR address)
    if (keyword) {
      andConditions.push({
        OR: [
          {
            searchTerms: {
              contains: removeVietnameseTones(keyword).toLowerCase(),
              mode: 'insensitive',
            },
          },
          { name: { contains: keyword, mode: 'insensitive' } },
          { address: { contains: keyword, mode: 'insensitive' } },
        ],
      });
    }

    // Location filters
    if (city) {
      andConditions.push({ city: { contains: city, mode: 'insensitive' } });
    }
    if (district) {
      const normalizedDistrict = this.normalizeAdminUnit(district);
      andConditions.push({
        OR: [
          { district: { equals: district, mode: 'insensitive' } },
          { district: { equals: normalizedDistrict, mode: 'insensitive' } },
        ],
      });
    }

    // Status filter - default to ACTIVE
    andConditions.push({ status: status ?? VenueStatus.ACTIVE });

    // Verified filter
    if (isVerified !== undefined) {
      andConditions.push({ isVerified });
    }

    const where: Prisma.VenueWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip,
        take: limit,
        orderBy: this.buildOrderBy(sortBy, sortOrder),
      }),
      this.prisma.venue.count({ where }),
    ]);

    // Post-fetch: distance calculation and filtering
    let result = venues.map((venue) => ({
      ...venue,
      distance:
        lat !== undefined && lng !== undefined && venue.lat && venue.lng
          ? this.calculateDistance(lat, lng, venue.lat, venue.lng)
          : null,
    }));

    // Filter by radius
    if (lat !== undefined && lng !== undefined && radius !== undefined) {
      result = result.filter(
        (v) => v.distance === null || v.distance <= radius
      );
    }

    // Sort by distance if requested
    if (sortBy === 'distance' && lat !== undefined && lng !== undefined) {
      result.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return sortOrder === 'asc'
          ? a.distance - b.distance
          : b.distance - a.distance;
      });
    }

    return {
      data: result,
      pagination: {
        page,
        limit,
        total: radius !== undefined ? result.length : total,
        totalPages: Math.ceil(
          (radius !== undefined ? result.length : total) / limit
        ),
      },
    };
  }

  async findAll(filters?: { page?: number; limit?: number }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 12;
    const skip = (page - 1) * limit;

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.venue.count(),
    ]);

    return {
      data: venues,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.venue.findUnique({
      where: { id },
    });
  }

  async create(createVenueDto: CreateVenueDto) {
    const district = createVenueDto.district
      ? this.normalizeAdminUnit(createVenueDto.district)
      : createVenueDto.district;
    const city = createVenueDto.city
      ? this.normalizeAdminUnit(createVenueDto.city)
      : createVenueDto.city;
    return this.prisma.venue.create({
      data: {
        ...createVenueDto,
        district,
        city,
        searchTerms: removeVietnameseTones(
          `${createVenueDto.name} ${createVenueDto.address} ${district || ''} ${city || ''}`
        ).toLowerCase(),
      },
    });
  }

  async update(id: string, updateVenueDto: UpdateVenueDto) {
    const district = updateVenueDto.district
      ? this.normalizeAdminUnit(updateVenueDto.district)
      : updateVenueDto.district;
    const city = updateVenueDto.city
      ? this.normalizeAdminUnit(updateVenueDto.city)
      : updateVenueDto.city;
    return this.prisma.venue.update({
      where: { id },
      data: {
        ...updateVenueDto,
        ...(district !== undefined ? { district } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(updateVenueDto.name || updateVenueDto.address
          ? {
              searchTerms: removeVietnameseTones(
                `${updateVenueDto.name || ''} ${updateVenueDto.address || ''} ${district || ''} ${city || ''}`
              ).toLowerCase(),
            }
          : {}),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.venue.delete({
      where: { id },
    });
  }

  /**
   * Strips Vietnamese administrative unit prefixes (Quận, Huyện, Thị xã,
   * Thành phố) from a location name so values are stored/queried consistently
   * without the prefix (e.g. "Quận Bình Thạnh" → "Bình Thạnh").
   */
  private normalizeAdminUnit(value: string): string {
    return value.replace(/^(Quận|Huyện|Thị xã|Thành phố)\s+/i, '').trim();
  }

  private buildOrderBy(
    sortBy: string,
    sortOrder: string
  ): Prisma.VenueOrderByWithRelationInput {
    if (sortBy === 'distance') {
      // Distance sort is handled post-fetch; use name as DB fallback
      return { name: sortOrder as Prisma.SortOrder };
    }
    const supportedFields = [
      'name',
      'createdAt',
      'numberOfCourts',
      'hourlyRateFixed',
    ];
    const field = supportedFields.includes(sortBy) ? sortBy : 'name';
    const order = sortOrder as Prisma.SortOrder;
    // Push null values to the end for nullable numeric fields
    const nullableFields = ['numberOfCourts', 'hourlyRateFixed'];
    if (nullableFields.includes(field)) {
      return { [field]: { sort: order, nulls: 'last' } };
    }
    return { [field]: order };
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
