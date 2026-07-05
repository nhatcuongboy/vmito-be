import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClosureStatus,
  Prisma,
  SportType,
  VenueCustomerType,
  VenueDayType,
  VenueStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { SearchVenueDto } from './dto/search-venue.dto';
import {
  CalculateVenueRentalPriceDto,
  CreateVenuePriceBookDto,
  CreateVenuePriceRuleDto,
  UpdateVenuePriceBookDto,
  UpdateVenuePriceRuleDto,
} from './dto/venue-pricing.dto';
import {
  removeVietnameseTones,
  generateSlug,
} from '../common/utils/string.utils';
import { AddressMappingService } from './address-mapping.service';

/**
 * Per-sport display/search prefixes. Raw venue names don't include the
 * sport prefix ("Nhật Cường" not "Sân cầu lông Nhật Cường"), so it is
 * prepended when generating slugs and searchTerms.
 * - label: Vietnamese display prefix (used for slugs)
 * - search: normalized (tone-less, lowercase) tokens for searchTerms
 */
const SPORT_PREFIX: Record<SportType, { label: string; search: string }> = {
  [SportType.BADMINTON]: { label: 'Sân cầu lông', search: 'san cau long' },
  [SportType.PICKLEBALL]: { label: 'Sân pickleball', search: 'san pickleball' },
};

@Injectable()
export class VenuesService {
  constructor(
    private prisma: PrismaService,
    private addressMapping: AddressMappingService
  ) {}

  /**
   * Generate a unique venue slug from the venue name.
   * Prepends the sport prefix (e.g. "Sân cầu lông") since raw venue names
   * don't include it.
   * Format: "san-cau-long-" + generateSlug(name) + "-" + random5chars
   * If a collision occurs, regenerate with a new random suffix.
   */
  private async generateUniqueSlug(
    name: string,
    sportType: SportType = SportType.BADMINTON
  ): Promise<string> {
    const base = generateSlug(`${SPORT_PREFIX[sportType].label} ${name}`);
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

  /**
   * Build the normalized searchTerms string for a venue. Includes the
   * sport prefix tokens (e.g. "san cau long") so keyword searches like
   * "Sân cầu lông Nhật Cường" or "Sân Nhật Cường" match venues whose
   * stored name is just "Nhật Cường".
   */
  private buildSearchTerms(venue: {
    name: string;
    sportType?: SportType | null;
    address?: string | null;
    district?: string | null;
    city?: string | null;
    newAddress?: string | null;
    newDistrict?: string | null;
    newCity?: string | null;
  }): string {
    const prefix = SPORT_PREFIX[venue.sportType ?? SportType.BADMINTON].search;
    return removeVietnameseTones(
      [
        prefix,
        venue.name,
        venue.address,
        venue.district,
        venue.city,
        venue.newAddress,
        venue.newDistrict,
        venue.newCity,
      ]
        .filter(Boolean)
        .join(' ')
    ).toLowerCase();
  }

  async searchVenues(filters: SearchVenueDto) {
    const {
      placeId,
      keyword,
      city,
      district,
      lat,
      lng,
      radius,
      status,
      isVerified,
      hasNewAddress,
      closureStatus,
      sortBy: rawSortBy,
      sortOrder = 'asc',
      page = 1,
      limit = 12,
    } = filters;

    // Auto-set sortBy to 'relevance' if keyword is provided and sortBy is not explicitly set
    const sortBy = rawSortBy || (keyword ? 'relevance' : 'name');

    const skip = (page - 1) * limit;
    const andConditions: Prisma.VenueWhereInput[] = [];

    if (placeId) {
      andConditions.push({ placeId });
    }

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

    // Status filter - default to ACTIVE unless doing an exact placeId lookup
    if (status || !placeId) {
      andConditions.push({ status: status ?? VenueStatus.ACTIVE });
    }

    // Closure status filter - default to OPERATING unless doing an exact placeId lookup
    if (closureStatus || !placeId) {
      andConditions.push({
        closureStatus: closureStatus ?? ClosureStatus.OPERATING,
      });
    }

    // Verified filter
    if (isVerified !== undefined) {
      andConditions.push({ isVerified });
    }

    // New-era address presence filter (Nghị quyết 60 migration)
    if (hasNewAddress !== undefined) {
      andConditions.push(
        hasNewAddress ? { newAddress: { not: null } } : { newAddress: null }
      );
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
      const normalizedKeyword = removeVietnameseTones(keyword).toLowerCase();
      const keywordTokens = normalizedKeyword.split(/\s+/).filter(Boolean);

      // Score against both the bare name and the sport-prefixed name
      // ("sân cầu lông nhật cường"), so queries that include the prefix
      // still get the exact/starts-with bonuses.
      const scoreVenue = (venue: {
        name: string;
        sportType?: SportType | null;
        address: string | null;
      }) => {
        const name = venue.name.toLowerCase();
        const normalized = removeVietnameseTones(venue.name).toLowerCase();
        const address = (venue.address || '').toLowerCase();
        const prefix = SPORT_PREFIX[venue.sportType ?? SportType.BADMINTON];

        return Math.max(
          this.calculateRelevanceScore(
            name,
            normalized,
            address,
            lowerKeyword,
            normalizedKeyword,
            keywordTokens
          ),
          this.calculateRelevanceScore(
            `${prefix.label.toLowerCase()} ${name}`,
            `${prefix.search} ${normalized}`,
            address,
            lowerKeyword,
            normalizedKeyword,
            keywordTokens
          )
        );
      };

      result.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        // Calculate relevance scores
        const aScore = scoreVenue(a);
        const bScore = scoreVenue(b);

        // Sort by score descending
        if (aScore !== bScore) return bScore - aScore;

        // If same score, prefer shorter names (more specific)
        if (aName.length !== bName.length) {
          return aName.length - bName.length;
        }

        // Fallback to alphabetical order
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

  async findPriceBooks(venueId: string) {
    await this.ensureVenueExists(venueId);

    return this.prisma.venuePriceBook.findMany({
      where: { venueId },
      include: {
        rules: { orderBy: [{ priority: 'desc' }, { startMinute: 'asc' }] },
      },
      orderBy: [
        { isActive: 'desc' },
        { priority: 'desc' },
        { effectiveFrom: 'desc' },
      ],
    });
  }

  async createPriceBook(venueId: string, dto: CreateVenuePriceBookDto) {
    await this.ensureVenueExists(venueId);

    return this.prisma.venuePriceBook.create({
      data: {
        venueId,
        name: dto.name,
        currency: dto.currency || 'VND',
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        notes: dto.notes,
        priceImageUrl: dto.priceImageUrl,
        priceImagePublicId: dto.priceImagePublicId,
      },
      include: { rules: true },
    });
  }

  async findPriceBook(venueId: string, priceBookId: string) {
    return this.ensurePriceBook(venueId, priceBookId);
  }

  async updatePriceBook(
    venueId: string,
    priceBookId: string,
    dto: UpdateVenuePriceBookDto
  ) {
    await this.ensurePriceBook(venueId, priceBookId);

    return this.prisma.venuePriceBook.update({
      where: { id: priceBookId },
      data: {
        name: dto.name,
        currency: dto.currency,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : undefined,
        effectiveTo:
          dto.effectiveTo === undefined
            ? undefined
            : dto.effectiveTo
              ? new Date(dto.effectiveTo)
              : null,
        isActive: dto.isActive,
        priority: dto.priority,
        notes: dto.notes,
        priceImageUrl: dto.priceImageUrl,
        priceImagePublicId: dto.priceImagePublicId,
      },
      include: {
        rules: { orderBy: [{ priority: 'desc' }, { startMinute: 'asc' }] },
      },
    });
  }

  async deletePriceBook(venueId: string, priceBookId: string) {
    await this.ensurePriceBook(venueId, priceBookId);

    await this.prisma.venuePriceBook.delete({
      where: { id: priceBookId },
    });

    return { message: 'Price book deleted successfully' };
  }

  async createPriceRule(
    venueId: string,
    priceBookId: string,
    dto: CreateVenuePriceRuleDto
  ) {
    await this.ensurePriceBook(venueId, priceBookId);
    this.validatePriceRule(dto);

    return this.prisma.venuePriceRule.create({
      data: this.buildPriceRuleData(priceBookId, dto),
    });
  }

  async updatePriceRule(
    venueId: string,
    priceBookId: string,
    ruleId: string,
    dto: UpdateVenuePriceRuleDto
  ) {
    await this.ensurePriceBook(venueId, priceBookId);
    const existing = await this.prisma.venuePriceRule.findFirst({
      where: { id: ruleId, priceBookId },
    });

    if (!existing) {
      throw new NotFoundException('Price rule not found');
    }

    const merged = { ...existing, ...dto };
    this.validatePriceRule(merged);

    return this.prisma.venuePriceRule.update({
      where: { id: ruleId },
      data: {
        dayType: dto.dayType,
        daysOfWeek: dto.daysOfWeek,
        specificDate:
          dto.specificDate === undefined
            ? undefined
            : dto.specificDate
              ? new Date(dto.specificDate)
              : null,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        customerType: dto.customerType,
        pricePerHour: dto.pricePerHour,
        minimumMinutes: dto.minimumMinutes,
        billingStepMinutes: dto.billingStepMinutes,
        priority: dto.priority,
        notes: dto.notes,
      },
    });
  }

  async deletePriceRule(venueId: string, priceBookId: string, ruleId: string) {
    await this.ensurePriceBook(venueId, priceBookId);
    const existing = await this.prisma.venuePriceRule.findFirst({
      where: { id: ruleId, priceBookId },
    });

    if (!existing) {
      throw new NotFoundException('Price rule not found');
    }

    await this.prisma.venuePriceRule.delete({ where: { id: ruleId } });
    return { message: 'Price rule deleted successfully' };
  }

  async calculateRentalPrice(
    venueId: string,
    dto: CalculateVenueRentalPriceDto
  ) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        hourlyRateFixed: true,
        hourlyRateWalkIn: true,
        priceBooks: {
          where: {
            isActive: true,
            effectiveFrom: { lte: new Date(dto.startTime) },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date(dto.startTime) } },
            ],
          },
          include: { rules: true },
          orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
          take: 1,
        },
      },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const startDateKey = this.getDateKey(dto.startTime);
    const endDateKey = this.getDateKey(dto.endTime);
    if (startDateKey !== endDateKey) {
      throw new BadRequestException(
        'Rental price calculation supports one calendar day at a time'
      );
    }

    const startMinute = this.getMinuteOfDay(dto.startTime);
    const endMinute = this.getMinuteOfDay(dto.endTime);
    if (endMinute <= startMinute) {
      throw new BadRequestException(
        'endTime must be after startTime on the same day'
      );
    }

    const priceBook = venue.priceBooks[0] || null;
    const dayOfWeek = this.getDayOfWeek(startDateKey);
    const rules = priceBook
      ? priceBook.rules.filter((rule) =>
          this.ruleAppliesToDate(
            rule,
            startDateKey,
            dayOfWeek,
            dto.customerType
          )
        )
      : [];
    const boundaries = new Set<number>([startMinute, endMinute]);

    for (const rule of rules) {
      if (rule.endMinute > startMinute && rule.startMinute < endMinute) {
        boundaries.add(Math.max(startMinute, rule.startMinute));
        boundaries.add(Math.min(endMinute, rule.endMinute));
      }
    }

    const points = Array.from(boundaries).sort((a, b) => a - b);
    const breakdown: Array<{
      fromMinute: number;
      toMinute: number;
      from: string;
      to: string;
      minutes: number;
      billableMinutes: number;
      numberOfCourts: number;
      pricePerHour: number;
      amount: number;
      ruleId: string | null;
      source: 'PRICE_BOOK' | 'LEGACY';
    }> = [];
    let totalAmount = 0;

    for (let index = 0; index < points.length - 1; index++) {
      const fromMinute = points[index];
      const toMinute = points[index + 1];
      if (toMinute <= fromMinute) continue;

      const matchingRules = rules
        .filter(
          (rule) => rule.startMinute < toMinute && rule.endMinute > fromMinute
        )
        .sort(
          (a, b) => b.priority - a.priority || b.pricePerHour - a.pricePerHour
        );
      const rule = matchingRules[0];
      const pricePerHour =
        rule?.pricePerHour ?? this.getLegacyHourlyRate(venue, dto.customerType);

      if (!pricePerHour) continue;

      const rawMinutes = toMinute - fromMinute;
      const billableMinutes = this.getBillableMinutes(rawMinutes, rule);
      const amount = Math.round(
        (pricePerHour * billableMinutes * dto.numberOfCourts) / 60
      );

      totalAmount += amount;
      breakdown.push({
        fromMinute,
        toMinute,
        from: this.formatMinute(fromMinute),
        to: this.formatMinute(toMinute),
        minutes: rawMinutes,
        billableMinutes,
        numberOfCourts: dto.numberOfCourts,
        pricePerHour,
        amount,
        ruleId: rule?.id ?? null,
        source: rule ? 'PRICE_BOOK' : 'LEGACY',
      });
    }

    return {
      totalAmount,
      priceBookId: priceBook?.id ?? null,
      currency: priceBook?.currency ?? 'VND',
      breakdown,
    };
  }

  async create(createVenueDto: CreateVenueDto) {
    // Check for duplicate placeId
    if (createVenueDto.placeId) {
      const existing = await this.findByPlaceId(createVenueDto.placeId);
      if (existing) {
        throw new ConflictException(
          'A venue with this location already exists.'
        );
      }
    }

    return this.createVenueRecord(createVenueDto);
  }

  async findOrCreate(createVenueDto: CreateVenueDto) {
    if (createVenueDto.placeId) {
      const existing = await this.findByPlaceId(createVenueDto.placeId);
      if (existing) {
        return existing;
      }
    }

    try {
      return await this.createVenueRecord(createVenueDto);
    } catch (error) {
      if (
        createVenueDto.placeId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByPlaceId(createVenueDto.placeId);
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  private findByPlaceId(placeId: string) {
    return this.prisma.venue.findUnique({
      where: { placeId },
    });
  }

  private async createVenueRecord(createVenueDto: CreateVenueDto) {
    const district = createVenueDto.district
      ? this.normalizeAdminUnit(createVenueDto.district)
      : createVenueDto.district;
    const city = createVenueDto.city
      ? this.normalizeAdminUnit(createVenueDto.city)
      : createVenueDto.city;

    // Auto-resolve new address from CSV mapping if not explicitly provided
    let autoNewAddress = createVenueDto.newAddress;
    let autoNewDistrict = createVenueDto.newDistrict;
    let autoNewCity = createVenueDto.newCity;
    if (!createVenueDto.newAddress) {
      const resolved = this.addressMapping.resolve(
        createVenueDto.address || '',
        district || createVenueDto.district || '',
        city || createVenueDto.city || ''
      );
      if (resolved?.newAddress) {
        autoNewAddress = resolved.newAddress;
        autoNewDistrict = resolved.newDistrict;
      }
      if (resolved?.newCity) autoNewCity = resolved.newCity;
    }

    const slug = await this.generateUniqueSlug(
      createVenueDto.name,
      createVenueDto.sportType
    );

    return this.prisma.venue.create({
      data: {
        ...createVenueDto,
        slug,
        district,
        city,
        newAddress: autoNewAddress,
        newDistrict: autoNewDistrict,
        newCity: autoNewCity,
        searchTerms: this.buildSearchTerms({
          name: createVenueDto.name,
          sportType: createVenueDto.sportType,
          address: createVenueDto.address,
          district,
          city,
          newAddress: autoNewAddress,
          newDistrict: autoNewDistrict,
          newCity: autoNewCity,
        }),
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

      const slug = await this.generateUniqueSlug(venue.name, venue.sportType);

      // Auto-resolve new address from CSV mapping if not explicitly provided
      let autoNewAddress = venue.newAddress;
      let autoNewDistrict = venue.newDistrict;
      let autoNewCity = venue.newCity;
      if (!venue.newAddress) {
        const resolved = this.addressMapping.resolve(
          venue.address || '',
          district || venue.district || '',
          city || venue.city || ''
        );
        if (resolved?.newAddress) {
          autoNewAddress = resolved.newAddress;
          autoNewDistrict = resolved.newDistrict;
        }
        if (resolved?.newCity) autoNewCity = resolved.newCity;
      }

      try {
        const created = await this.prisma.venue.create({
          data: {
            ...venue,
            slug,
            district,
            city,
            newAddress: autoNewAddress,
            newDistrict: autoNewDistrict,
            newCity: autoNewCity,
            searchTerms: this.buildSearchTerms({
              name: venue.name,
              sportType: venue.sportType,
              address: venue.address,
              district,
              city,
              newAddress: autoNewAddress,
              newDistrict: autoNewDistrict,
              newCity: autoNewCity,
            }),
          },
        });
        results.push(created);
      } catch {
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

    // Auto-resolve new address when address-related fields change but newAddress was not explicitly set
    let resolvedNewAddress: string | undefined;
    let resolvedNewDistrict: string | undefined;
    let resolvedNewCity: string | undefined;
    const addressFieldsChanged =
      updateVenueDto.address || updateVenueDto.district || updateVenueDto.city;
    if (updateVenueDto.newAddress === undefined && addressFieldsChanged) {
      const resolved = this.addressMapping.resolve(
        updateVenueDto.address || '',
        district || updateVenueDto.district || '',
        city || updateVenueDto.city || ''
      );
      if (resolved?.newAddress) {
        resolvedNewAddress = resolved.newAddress;
        resolvedNewDistrict = resolved.newDistrict;
      }
      if (resolved?.newCity) resolvedNewCity = resolved.newCity;
    }

    const existing = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        name: true,
        sportType: true,
        address: true,
        district: true,
        city: true,
        newAddress: true,
        newDistrict: true,
        newCity: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Venue not found');
    }

    // Rebuild searchTerms from the merged (DTO over stored) values so
    // partial updates never drop existing fields from the search index.
    const searchTerms = this.buildSearchTerms({
      name: updateVenueDto.name ?? existing.name,
      sportType: updateVenueDto.sportType ?? existing.sportType,
      address: updateVenueDto.address ?? existing.address,
      district: district ?? existing.district,
      city: city ?? existing.city,
      newAddress:
        updateVenueDto.newAddress ?? resolvedNewAddress ?? existing.newAddress,
      newDistrict:
        updateVenueDto.newDistrict ??
        resolvedNewDistrict ??
        existing.newDistrict,
      newCity: updateVenueDto.newCity ?? resolvedNewCity ?? existing.newCity,
    });

    return this.prisma.venue.update({
      where: { id },
      data: {
        ...updateVenueDto,
        ...(district !== undefined ? { district } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(resolvedNewAddress
          ? { newAddress: resolvedNewAddress, newDistrict: resolvedNewDistrict }
          : {}),
        ...(resolvedNewCity ? { newCity: resolvedNewCity } : {}),
        searchTerms,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.venue.delete({
      where: { id },
    });
  }

  private async ensureVenueExists(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    return venue;
  }

  private async ensurePriceBook(venueId: string, priceBookId: string) {
    const priceBook = await this.prisma.venuePriceBook.findFirst({
      where: { id: priceBookId, venueId },
      include: {
        rules: { orderBy: [{ priority: 'desc' }, { startMinute: 'asc' }] },
      },
    });

    if (!priceBook) {
      throw new NotFoundException('Price book not found');
    }

    return priceBook;
  }

  private validatePriceRule(rule: {
    dayType?: VenueDayType;
    daysOfWeek?: number[] | null;
    specificDate?: Date | string | null;
    startMinute?: number;
    endMinute?: number;
    pricePerHour?: number;
  }) {
    if (
      rule.startMinute === undefined ||
      rule.endMinute === undefined ||
      rule.endMinute <= rule.startMinute
    ) {
      throw new BadRequestException(
        'endMinute must be greater than startMinute'
      );
    }

    if (rule.dayType === VenueDayType.SPECIFIC_DATE && !rule.specificDate) {
      throw new BadRequestException(
        'specificDate is required for SPECIFIC_DATE rules'
      );
    }

    if (rule.pricePerHour !== undefined && rule.pricePerHour < 0) {
      throw new BadRequestException(
        'pricePerHour must be greater than or equal to 0'
      );
    }
  }

  private buildPriceRuleData(
    priceBookId: string,
    dto: CreateVenuePriceRuleDto
  ): Prisma.VenuePriceRuleUncheckedCreateInput {
    return {
      priceBookId,
      dayType: dto.dayType,
      daysOfWeek: dto.daysOfWeek || [],
      specificDate: dto.specificDate ? new Date(dto.specificDate) : null,
      startMinute: dto.startMinute,
      endMinute: dto.endMinute,
      customerType: dto.customerType,
      pricePerHour: dto.pricePerHour,
      minimumMinutes: dto.minimumMinutes,
      billingStepMinutes: dto.billingStepMinutes,
      priority: dto.priority ?? 0,
      notes: dto.notes,
    };
  }

  private ruleAppliesToDate(
    rule: {
      dayType: VenueDayType;
      daysOfWeek: number[];
      specificDate: Date | null;
      customerType: VenueCustomerType;
    },
    dateKey: string,
    dayOfWeek: number,
    customerType: VenueCustomerType
  ) {
    if (rule.customerType !== customerType) return false;

    switch (rule.dayType) {
      case VenueDayType.EVERYDAY:
        return true;
      case VenueDayType.WEEKDAY:
        return rule.daysOfWeek.length
          ? rule.daysOfWeek.includes(dayOfWeek)
          : dayOfWeek >= 1 && dayOfWeek <= 5;
      case VenueDayType.WEEKEND:
        return dayOfWeek === 6 || dayOfWeek === 7;
      case VenueDayType.SPECIFIC_DATE:
      case VenueDayType.HOLIDAY:
        return rule.specificDate
          ? this.getDateKey(rule.specificDate.toISOString()) === dateKey
          : false;
      default:
        return false;
    }
  }

  private getLegacyHourlyRate(
    venue: {
      hourlyRateFixed?: number | null;
      hourlyRateWalkIn?: number | null;
    },
    customerType: VenueCustomerType
  ) {
    if (customerType === VenueCustomerType.FIXED) {
      return venue.hourlyRateFixed || venue.hourlyRateWalkIn || 0;
    }

    return venue.hourlyRateWalkIn || venue.hourlyRateFixed || 0;
  }

  private getBillableMinutes(
    rawMinutes: number,
    rule?: {
      minimumMinutes?: number | null;
      billingStepMinutes?: number | null;
    }
  ) {
    let minutes = Math.max(rawMinutes, rule?.minimumMinutes || rawMinutes);
    if (rule?.billingStepMinutes) {
      minutes =
        Math.ceil(minutes / rule.billingStepMinutes) * rule.billingStepMinutes;
    }
    return minutes;
  }

  private getDateKey(value: string) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    return new Date(value).toISOString().slice(0, 10);
  }

  private getMinuteOfDay(value: string) {
    const match = value.match(/T(\d{2}):(\d{2})/);
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }

    const date = new Date(value);
    return date.getHours() * 60 + date.getMinutes();
  }

  private getDayOfWeek(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const adjustedMonth = month < 3 ? month + 12 : month;
    const adjustedYear = month < 3 ? year - 1 : year;
    const century = Math.floor(adjustedYear / 100);
    const yearOfCentury = adjustedYear % 100;
    const zeller =
      (day +
        Math.floor((13 * (adjustedMonth + 1)) / 5) +
        yearOfCentury +
        Math.floor(yearOfCentury / 4) +
        Math.floor(century / 4) +
        5 * century) %
      7;
    const sundayZero = (zeller + 6) % 7;
    return sundayZero === 0 ? 7 : sundayZero;
  }

  private formatMinute(minute: number) {
    const hours = Math.floor(minute / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (minute % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Backfill slugs for existing venues that don't have a slug.
   * This is an admin-only one-time operation.
   */
  async migrateAddresses() {
    const venues = await this.prisma.venue.findMany({
      where: { newAddress: null },
      select: {
        id: true,
        address: true,
        district: true,
        city: true,
        name: true,
        sportType: true,
        searchTerms: true,
      },
    });

    let matched = 0;
    let cityOnly = 0;
    let unmatched = 0;

    for (const venue of venues) {
      const resolved = this.addressMapping.resolve(
        venue.address || '',
        venue.district || '',
        venue.city || ''
      );

      if (!resolved) {
        unmatched++;
        continue;
      }

      const updateData: Record<string, string | undefined> = {};

      if (resolved.newAddress) {
        updateData.newAddress = resolved.newAddress;
        updateData.newDistrict = resolved.newDistrict;
        updateData.searchTerms = this.buildSearchTerms({
          name: venue.name,
          sportType: venue.sportType,
          address: venue.address,
          district: venue.district,
          city: venue.city,
          newAddress: resolved.newAddress,
          newDistrict: resolved.newDistrict,
          newCity: resolved.newCity,
        });
        matched++;
      }

      if (resolved.newCity) {
        updateData.newCity = resolved.newCity;
        if (!resolved.newAddress) cityOnly++;
      }

      if (Object.keys(updateData).length > 0) {
        await this.prisma.venue.update({
          where: { id: venue.id },
          data: updateData,
        });
      }
    }

    return {
      message: 'Address migration complete',
      total: venues.length,
      matched,
      cityOnly,
      unmatched,
    };
  }

  async backfillSlugs() {
    const venues = await this.prisma.venue.findMany({
      where: { slug: null },
      select: { id: true, name: true, sportType: true },
    });

    let updated = 0;
    for (const venue of venues) {
      const slug = await this.generateUniqueSlug(venue.name, venue.sportType);
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
   * Rebuild searchTerms for all venues (adds the sport prefix tokens).
   * This is an admin-only one-time operation.
   */
  async backfillSearchTerms() {
    const venues = await this.prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        sportType: true,
        address: true,
        district: true,
        city: true,
        newAddress: true,
        newDistrict: true,
        newCity: true,
      },
    });

    let updated = 0;
    for (const venue of venues) {
      await this.prisma.venue.update({
        where: { id: venue.id },
        data: { searchTerms: this.buildSearchTerms(venue) },
      });
      updated++;
    }

    return {
      message: `Backfilled ${updated} venue search terms`,
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

  /**
   * Calculate relevance score for venue search results.
   * Higher score = more relevant.
   */
  private calculateRelevanceScore(
    name: string,
    normalizedName: string,
    address: string,
    keyword: string,
    normalizedKeyword: string,
    keywordTokens: string[]
  ): number {
    let score = 0;

    // 1. Exact match (highest priority) - 1000 points
    if (name === keyword || normalizedName === normalizedKeyword) {
      score += 1000;
      return score; // Return immediately for exact matches
    }

    // 2. Starts with keyword - 500 points
    if (
      name.startsWith(keyword) ||
      normalizedName.startsWith(normalizedKeyword)
    ) {
      score += 500;
    }

    // 3. Contains keyword as whole phrase - 300 points
    if (name.includes(keyword) || normalizedName.includes(normalizedKeyword)) {
      score += 300;
    }

    // 4. Token matching - up to 200 points
    const nameTokens = normalizedName.split(/\s+/).filter(Boolean);
    let tokenMatchCount = 0;
    let exactTokenMatches = 0;

    for (const keywordToken of keywordTokens) {
      for (const nameToken of nameTokens) {
        if (nameToken === keywordToken) {
          exactTokenMatches++;
          tokenMatchCount++;
        } else if (
          nameToken.includes(keywordToken) ||
          keywordToken.includes(nameToken)
        ) {
          tokenMatchCount++;
        }
      }
    }

    // Exact token matches worth more
    score += exactTokenMatches * 50;
    score += (tokenMatchCount - exactTokenMatches) * 20;

    // 5. Address matching - 100 points
    if (
      address.includes(keyword) ||
      removeVietnameseTones(address).toLowerCase().includes(normalizedKeyword)
    ) {
      score += 100;
    }

    // 6. Bonus for shorter names (more specific) - up to 50 points
    // Penalize very long names
    const lengthPenalty = Math.max(0, 50 - normalizedName.length);
    score += lengthPenalty;

    return score;
  }
}
