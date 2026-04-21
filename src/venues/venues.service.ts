import { Injectable } from '@nestjs/common';
import { ClosureStatus, Prisma, VenueStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { SearchVenueDto } from './dto/search-venue.dto';
import {
  removeVietnameseTones,
  generateSlug,
} from '../common/utils/string.utils';

@Injectable()
export class VenuesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate a unique venue slug from the venue name.
   * Prepends "Sân cầu lông" since raw venue names don't include it.
   * Format: "san-cau-long-" + generateSlug(name) + "-" + random5chars
   * If a collision occurs, regenerate with a new random suffix.
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base = generateSlug(`Sân cầu lông ${name}`);
    let slug = base;
    let attempts = 0;

    while (attempts < 10) {
      const existing = await this.prisma.venue.findUnique({
        where: { slug },
      });

      if (!existing) {
        return slug;
      }

      // Collision detected, append random suffix
      slug = `${base}-${Math.random().toString(36).substring(2, 7)}`;
      attempts++;
    }

    return slug;
  }

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
      closureStatus,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 12,
    } = filters;

    const skip = (page - 1) * limit;
    const andConditions: Prisma.VenueWhereInput[] = [];

    // Keyword search (name OR address)
    if (keyword) {
      const normalizedKeyword = removeVietnameseTones(keyword).toLowerCase();
      const tokens = normalizedKeyword.split(/\s+/).filter(Boolean);

      andConditions.push({
        OR: [
          {
            AND: tokens.map((token) => ({
              searchTerms: {
                contains: token,
                mode: 'insensitive',
              },
            })),
          },
          { name: { contains: keyword, mode: 'insensitive' } },
          { address: { contains: keyword, mode: 'insensitive' } },
          { newAddress: { contains: keyword, mode: 'insensitive' } },
        ],
      });
    }

    // Location filters — support comma-separated values for multi-select
    if (city) {
      const cityList = city
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cityList.length === 1) {
        andConditions.push({
          city: { contains: cityList[0], mode: 'insensitive' },
        });
      } else {
        andConditions.push({
          OR: cityList.map((c) => ({
            city: { contains: c, mode: 'insensitive' },
          })),
        });
      }
    }
    if (district) {
      const districtList = district
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      if (districtList.length === 1) {
        const normalizedDistrict = this.normalizeAdminUnit(districtList[0]);
        andConditions.push({
          OR: [
            { district: { equals: districtList[0], mode: 'insensitive' } },
            {
              district: {
                equals: normalizedDistrict,
                mode: 'insensitive',
              },
            },
          ],
        });
      } else {
        andConditions.push({
          OR: districtList.flatMap((d) => {
            const normalized = this.normalizeAdminUnit(d);
            return [
              { district: { equals: d, mode: 'insensitive' } },
              { district: { equals: normalized, mode: 'insensitive' } },
            ];
          }),
        });
      }
    }

    // Status filter - default to ACTIVE
    andConditions.push({ status: status ?? VenueStatus.ACTIVE });

    // Closure status filter - default to OPERATING
    andConditions.push({
      closureStatus: closureStatus ?? ClosureStatus.OPERATING,
    });

    // Verified filter
    if (isVerified !== undefined) {
      andConditions.push({ isVerified });
    }

    const where: Prisma.VenueWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const isRelevanceSort = sortBy === 'relevance' && !!keyword;

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip: isRelevanceSort ? undefined : skip,
        take: isRelevanceSort ? undefined : limit,
        orderBy: isRelevanceSort
          ? undefined
          : this.buildOrderBy(sortBy, sortOrder),
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

    const finalTotal = radius !== undefined ? result.length : total;

    if (isRelevanceSort) {
      const lowerKeyword = keyword.toLowerCase();
      result.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        // Exact match
        const aExact = aName === lowerKeyword ? 1 : 0;
        const bExact = bName === lowerKeyword ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        // Starts with
        const aStarts = aName.startsWith(lowerKeyword) ? 1 : 0;
        const bStarts = bName.startsWith(lowerKeyword) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;

        // Contains
        const aContains = aName.includes(lowerKeyword) ? 1 : 0;
        const bContains = bName.includes(lowerKeyword) ? 1 : 0;
        if (aContains !== bContains) return bContains - aContains;

        // Fallback to name A-Z
        return aName.localeCompare(bName);
      });
      // Apply pagination in JS
      result = result.slice(skip, skip + limit);
    }

    return {
      data: result,
      pagination: {
        page,
        limit,
        total: finalTotal,
        totalPages: Math.ceil(finalTotal / limit),
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

  async findOne(idOrSlug: string) {
    // Try by id first, then by slug
    return this.prisma.venue.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });
  }

  async create(createVenueDto: CreateVenueDto) {
    const district = createVenueDto.district
      ? this.normalizeAdminUnit(createVenueDto.district)
      : createVenueDto.district;
    const city = createVenueDto.city
      ? this.normalizeAdminUnit(createVenueDto.city)
      : createVenueDto.city;

    const slug = await this.generateUniqueSlug(createVenueDto.name);

    return this.prisma.venue.create({
      data: {
        ...createVenueDto,
        slug,
        district,
        city,
        searchTerms: removeVietnameseTones(
          `${createVenueDto.name} ${createVenueDto.address} ${district || ''} ${city || ''} ${createVenueDto.newAddress || ''} ${createVenueDto.newDistrict || ''} ${createVenueDto.newCity || ''}`
        ).toLowerCase(),
      },
    });
  }

  async createBulk(createBulkVenueDto: { venues: CreateVenueDto[] }) {
    // For bulk creation, generate slugs individually to ensure uniqueness
    const results: Awaited<ReturnType<typeof this.prisma.venue.create>>[] = [];
    for (const venue of createBulkVenueDto.venues) {
      const district = venue.district
        ? this.normalizeAdminUnit(venue.district)
        : venue.district;
      const city = venue.city
        ? this.normalizeAdminUnit(venue.city)
        : venue.city;

      const slug = await this.generateUniqueSlug(venue.name);

      try {
        const created = await this.prisma.venue.create({
          data: {
            ...venue,
            slug,
            district,
            city,
            searchTerms: removeVietnameseTones(
              `${venue.name} ${venue.address} ${district || ''} ${city || ''} ${venue.newAddress || ''} ${venue.newDistrict || ''} ${venue.newCity || ''}`
            ).toLowerCase(),
          },
        });
        results.push(created);
      } catch (_err) {
        // Skip duplicates (e.g. duplicate placeId)
      }
    }

    return {
      message: 'Bulk created successfully',
      count: results.length,
    };
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
                `${updateVenueDto.name || ''} ${updateVenueDto.address || ''} ${district || ''} ${city || ''} ${updateVenueDto.newAddress || ''} ${updateVenueDto.newDistrict || ''} ${updateVenueDto.newCity || ''}`
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
   * Backfill slugs for existing venues that don't have a slug.
   * This is an admin-only one-time operation.
   */
  async backfillSlugs() {
    const venues = await this.prisma.venue.findMany({
      where: { slug: null },
      select: { id: true, name: true },
    });

    let updated = 0;
    for (const venue of venues) {
      const slug = await this.generateUniqueSlug(venue.name);
      await this.prisma.venue.update({
        where: { id: venue.id },
        data: { slug },
      });
      updated++;
    }

    return {
      message: `Backfilled ${updated} venue slugs`,
      count: updated,
    };
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
